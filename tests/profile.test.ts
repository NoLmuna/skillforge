import { describe, expect, it } from "vitest";
import { buildGreenfieldProfile, inspectPackageJson } from "../src/lib/profile";

describe("inspectPackageJson", () => {
  it("detects a Next.js, Prisma, and Vitest project and preserves its scripts", () => {
    const scripts = { dev: "next dev --turbopack", test: "vitest run", "db:migrate": "prisma migrate dev" };
    const result = inspectPackageJson(JSON.stringify({
      packageManager: "pnpm@10.0.0+sha512.example",
      dependencies: { next: "16", react: "19", "@prisma/client": "6" },
      devDependencies: { typescript: "5", prisma: "6", vitest: "5", tailwindcss: "4", eslint: "9" },
      scripts,
    }));

    expect(result).toEqual({
      ok: true,
      profile: {
        source: "package-json",
        packageManager: "pnpm",
        stack: ["nextjs", "react", "typescript", "tailwind", "prisma", "vitest", "eslint"],
        scripts,
      },
    });
  });

  it("recognizes additional tools in peer and optional dependencies", () => {
    expect(inspectPackageJson(JSON.stringify({
      packageManager: "yarn@4.0.0",
      peerDependencies: { "react-dom": "19", "@tailwindcss/vite": "4", "drizzle-orm": "1" },
      optionalDependencies: { "drizzle-kit": "1", "@playwright/test": "1", jest: "30", "@biomejs/biome": "2" },
    }))).toEqual({
      ok: true,
      profile: {
        source: "package-json",
        packageManager: "yarn",
        stack: ["react", "tailwind", "drizzle", "jest", "playwright", "biome"],
        scripts: {},
      },
    });
  });

  it("defaults a minimal project to npm with an empty stack and script list", () => {
    expect(inspectPackageJson('{"name":"minimal"}')).toEqual({
      ok: true,
      profile: { source: "package-json", packageManager: "npm", stack: [], scripts: {} },
    });
  });

  it("ignores malformed optional fields and retains valid scripts", () => {
    expect(inspectPackageJson(JSON.stringify({
      packageManager: "unknown@1",
      dependencies: { eslint: true },
      devDependencies: ["typescript"],
      scripts: { build: "node build.js", test: null },
    }))).toEqual({
      ok: true,
      profile: { source: "package-json", packageManager: "npm", stack: [], scripts: { build: "node build.js" } },
    });
  });

  it("returns a structured parse error without echoing the invalid input", () => {
    expect(inspectPackageJson('{"example":"private value",')).toEqual({
      ok: false,
      error: { code: "invalid-json", message: "Invalid package.json JSON." },
    });
  });

  it.each(["null", "[]", "3", '"manifest"'])("reports %s as an invalid manifest", (rawJson) => {
    expect(inspectPackageJson(rawJson)).toMatchObject({ ok: false, error: { code: "invalid-manifest" } });
  });
});

describe("buildGreenfieldProfile", () => {
  it("deduplicates selected chips and proposes scripts in the selected stack", () => {
    expect(buildGreenfieldProfile({
      stack: ["vitest", "nextjs", "typescript", "vitest", "playwright", "eslint", "tailwind"],
      packageManager: "bun",
    })).toEqual({
      source: "greenfield",
      packageManager: "bun",
      stack: ["nextjs", "typescript", "tailwind", "vitest", "playwright", "eslint"],
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        typecheck: "tsc --noEmit",
        lint: "eslint .",
        test: "vitest run",
        "test:e2e": "playwright test",
      },
    });
  });

  it("keeps explicitly selected test runners and linters from overwriting each other", () => {
    const { scripts } = buildGreenfieldProfile({ stack: ["vitest", "jest", "biome", "eslint"] });

    expect(scripts).toEqual({
      test: "vitest run",
      "test:jest": "jest",
      lint: "eslint .",
      "lint:biome": "biome check .",
    });
  });

  it("defaults to npm and keeps scripts empty when no runnable tools are selected", () => {
    expect(buildGreenfieldProfile({ stack: ["react", "drizzle"] })).toEqual({
      source: "greenfield",
      packageManager: "npm",
      stack: ["react", "drizzle"],
      scripts: {},
    });
  });
});
