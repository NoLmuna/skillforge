export const technologyNames = {
  nextjs: "Next.js",
  react: "React",
  typescript: "TypeScript",
  tailwind: "Tailwind CSS",
  prisma: "Prisma",
  drizzle: "Drizzle",
  vitest: "Vitest",
  jest: "Jest",
  playwright: "Playwright",
  eslint: "ESLint",
  biome: "Biome",
} as const;

export type Technology = keyof typeof technologyNames;
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface ProjectProfile {
  readonly source: "package-json" | "greenfield";
  readonly packageManager: PackageManager;
  readonly stack: readonly Technology[];
  readonly scripts: Readonly<Record<string, string>>;
}

export interface GreenfieldOptions {
  readonly stack: readonly Technology[];
  readonly packageManager?: PackageManager;
}

export interface PackageJsonError {
  readonly code: "invalid-json" | "invalid-manifest";
  readonly message: string;
}

export type PackageJsonResult =
  | { readonly ok: true; readonly profile: ProjectProfile }
  | { readonly ok: false; readonly error: PackageJsonError };

const dependencyNames: Record<Technology, readonly string[]> = {
  nextjs: ["next"],
  react: ["react", "react-dom"],
  typescript: ["typescript"],
  tailwind: ["tailwindcss", "@tailwindcss/postcss", "@tailwindcss/vite", "@tailwindcss/turbopack", "@tailwindcss/cli"],
  prisma: ["prisma", "@prisma/client"],
  drizzle: ["drizzle-orm", "drizzle-kit"],
  vitest: ["vitest"],
  jest: ["jest", "@jest/core"],
  playwright: ["playwright", "playwright-core", "@playwright/test"],
  eslint: ["eslint"],
  biome: ["@biomejs/biome"],
};

const technologies = Object.keys(technologyNames) as Technology[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringEntries(value: unknown): [string, string][] {
  if (!isRecord(value)) return [];

  return Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
}

export function inspectPackageJson(
  rawJson: string,
  lockfileManagers: readonly PackageManager[] = [],
): PackageJsonResult {
  let manifest: unknown;
  try {
    manifest = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: { code: "invalid-json", message: "Invalid package.json JSON." } };
  }

  if (!isRecord(manifest)) {
    return {
      ok: false,
      error: { code: "invalid-manifest", message: "package.json must contain a JSON object." },
    };
  }

  const dependencies = new Set(
    [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies, manifest.optionalDependencies]
      .flatMap(stringEntries)
      .map(([name]) => name),
  );
  const stack = technologies.filter((tool) =>
    dependencyNames[tool].some((name) => dependencies.has(name)),
  );

  const declaredManager = typeof manifest.packageManager === "string"
    ? manifest.packageManager.split("@", 1)[0]
    : undefined;
  const declared = declaredManager === "npm" || declaredManager === "pnpm" || declaredManager === "yarn" || declaredManager === "bun"
    ? declaredManager
    : undefined;
  const packageManager = declared && lockfileManagers.includes(declared)
    ? declared
    : lockfileManagers[0] ?? declared ?? "npm";

  return {
    ok: true,
    profile: {
      source: "package-json",
      packageManager,
      stack,
      scripts: Object.fromEntries(stringEntries(manifest.scripts)),
    },
  };
}

export function buildGreenfieldProfile(options: GreenfieldOptions): ProjectProfile {
  const selected = new Set(options.stack);
  const scripts: Record<string, string> = {};

  if (selected.has("nextjs")) {
    scripts.dev = "next dev";
    scripts.build = "next build";
    scripts.start = "next start";
  }
  if (selected.has("typescript")) scripts.typecheck = "tsc --noEmit";
  if (selected.has("eslint")) scripts.lint = "eslint .";
  if (selected.has("biome")) scripts[scripts.lint ? "lint:biome" : "lint"] = "biome check .";
  if (selected.has("vitest")) scripts.test = "vitest run";
  if (selected.has("jest")) scripts[scripts.test ? "test:jest" : "test"] = "jest";
  if (selected.has("playwright")) scripts["test:e2e"] = "playwright test";

  return {
    source: "greenfield",
    packageManager: options.packageManager ?? "npm",
    stack: technologies.filter((tool) => selected.has(tool)),
    scripts,
  };
}
