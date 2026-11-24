import { describe, expect, it } from "vitest";
import { skillBlueprints } from "../src/corpus/blueprints";
import { generateAgentsMd, generateSkillMd } from "../src/lib/generators";
import { lintMarkdown } from "../src/lib/linter";
import { buildGreenfieldProfile, inspectPackageJson } from "../src/lib/profile";

const validDescription = "Checks a schema change for compatibility. Use when planning a database migration.";
const validFrontmatter = `name: migration-guard\ndescription: ${validDescription}`;

function skillDocument(frontmatter: string): string {
  return `---\n${frontmatter}\n---\n\n# Migration Guard\n`;
}

describe("document metrics", () => {
  it.each([
    [0, 0, "optimal"],
    [1, 1, "optimal"],
    [4000, 1000, "optimal"],
    [4001, 1001, "heavy"],
    [7200, 1800, "heavy"],
    [7201, 1801, "bloated"],
  ])("classifies %i characters as %i estimated tokens in the %s budget", (characters, tokens, status) => {
    expect(lintMarkdown("x".repeat(characters), { kind: "agents" }).metrics).toEqual({
      lineCount: characters === 0 ? 0 : 1,
      characterCount: characters,
      estimatedTokens: tokens,
      budgetStatus: status,
    });
  });

  it("counts Unicode code points and physical lines across mixed line endings", () => {
    expect(lintMarkdown("# 🌱\r\n\r\nText\r", { kind: "agents" }).metrics).toEqual({
      lineCount: 3,
      characterCount: 12,
      estimatedTokens: 3,
      budgetStatus: "optimal",
    });
  });
});

describe("AGENTS.md lint", () => {
  it("offers a distinct actionable replacement for each vague phrase", () => {
    const markdown = [
      "# AGENTS.md",
      "- Write clean CODE.",
      "- Follow best practices.",
      "- Make sure everything works.",
      "- Write bug-free code.",
      "- Write clean codebase documentation.",
      "- Cover missing input and duplicate IDs with tests.",
    ].join("\n");

    const { diagnostics } = lintMarkdown(markdown, { kind: "agents" });
    expect(diagnostics).toHaveLength(4);
    expect(diagnostics.every(({ code, severity }) => code === "vague-phrase" && severity === "warning")).toBe(true);
    expect(diagnostics.map(({ line }) => line)).toEqual([2, 3, 4, 5]);
    expect(diagnostics.map(({ suggestion }) => suggestion)).toEqual([
      expect.stringContaining("formatter"),
      expect.stringContaining("convention"),
      expect.stringContaining("expected outcome"),
      expect.stringContaining("edge cases"),
    ]);
  });

  it("reports Unicode and ASCII tree branches without flagging an inline symbol", () => {
    const markdown = [
      "# AGENTS.md",
      "```text",
      "repo/",
      "├── src/",
      "│   └── nested/",
      "|-- tests/",
      "`-- package.json",
      "```",
      "Use `├──` only in diagrams.",
    ].join("\n");

    const { diagnostics } = lintMarkdown(markdown, { kind: "agents" });
    expect(diagnostics.map(({ code, line }) => [code, line])).toEqual([
      ["directory-tree", 4],
      ["directory-tree", 5],
      ["directory-tree", 6],
      ["directory-tree", 7],
    ]);
    expect(diagnostics[0]).toMatchObject({ severity: "warning", suggestion: expect.stringContaining("specific files") });
  });

  it("checks npm shortcuts, named scripts, and explicit run commands against the manifest", () => {
    const result = inspectPackageJson('{"scripts":{"lint":"eslint .","test:e2e":"playwright test","check docs":"node check"}}');
    if (!result.ok) throw new Error(result.error.message);
    const markdown = [
      "# AGENTS.md",
      "Run `npm test` and `npm run lint`.",
      "Then run npm run typecheck.",
      "```sh",
      "npm run-script 'check docs' && npm run \"test:e2e\" -- --headed",
      "pnpm run check:types",
      "yarn run lint && bun run lint",
      "npm run constructor",
      "```",
      "Run `npm install`, `npm exec vitest`, or just `npm run` to list scripts.",
    ].join("\n");

    const { diagnostics } = lintMarkdown(markdown, { kind: "agents", profile: result.profile });
    expect(diagnostics).toHaveLength(4);
    expect(diagnostics.every(({ code, severity }) => code === "missing-script" && severity === "warning")).toBe(true);
    expect(diagnostics.map(({ line, message }) => [line, message])).toEqual([
      [2, expect.stringContaining("npm test")],
      [3, expect.stringContaining("“typecheck”")],
      [6, expect.stringContaining("“check:types”")],
      [8, expect.stringContaining("“constructor”")],
    ]);
    expect(diagnostics[0].suggestion).toContain("package.json");
  });

  it("skips script checks without a profile", () => {
    expect(lintMarkdown("Run `npm test` and `npm run typecheck`.", { kind: "agents" }).diagnostics).toEqual([]);
  });

  it.each(["t", "tst"])("resolves npm %s to the test script", (alias) => {
    const markdown = `Run \`npm ${alias}\`.`;
    const profile = buildGreenfieldProfile({ stack: [] });

    expect(lintMarkdown(markdown, { kind: "agents", profile }).diagnostics).toEqual([
      expect.objectContaining({ code: "missing-script", message: expect.stringContaining("“test”") }),
    ]);
    expect(lintMarkdown(markdown, { kind: "agents", profile: buildGreenfieldProfile({ stack: ["vitest"] }) }).diagnostics).toEqual([]);
  });

  it("accepts generated instructions with matching profile scripts", () => {
    const profile = buildGreenfieldProfile({ stack: ["nextjs", "typescript", "vitest", "eslint"] });
    const { markdown } = generateAgentsMd(profile);

    expect(lintMarkdown(markdown, { kind: "agents", profile }).diagnostics).toEqual([]);
  });
});

describe("SKILL.md lint", () => {
  it.each(Object.values(skillBlueprints))("accepts the generated $title blueprint", ({ id }) => {
    expect(lintMarkdown(generateSkillMd({ blueprint: id }), { kind: "skill" }).diagnostics).toEqual([]);
  });

  it("parses folded YAML, comments, optional metadata, a BOM, and CRLF line endings", () => {
    const document = skillDocument([
      'name: "123" # quoted numeric slug',
      "description: >-",
      '  Check migrations for breaking changes: verify old and new clients.',
      '  Use when the user asks to upgrade a database schema.',
      "metadata:",
      '  author: "Team #2"',
    ].join("\n"));

    expect(lintMarkdown(`\uFEFF${document.replace(/\n/g, "\r\n")}`, { kind: "skill" }).diagnostics).toEqual([]);
  });

  it("accepts scalar aliases without expanding other metadata", () => {
    const markdown = skillDocument(`metadata:\n  summary: &summary "${validDescription}"\nname: migration-guard\ndescription: *summary`);

    expect(lintMarkdown(markdown, { kind: "skill" }).diagnostics).toEqual([]);
  });

  it.each([
    ["", "must start"],
    ["# Missing frontmatter", "must start"],
    [`\n${skillDocument(validFrontmatter)}`, "must start"],
    [`---\n${validFrontmatter}`, "closing delimiter"],
  ])("reports absent or incomplete frontmatter", (markdown, message) => {
    expect(lintMarkdown(markdown, { kind: "skill" }).diagnostics).toEqual([
      expect.objectContaining({ code: "missing-frontmatter", severity: "error", line: 1, message: expect.stringContaining(message) }),
    ]);
  });

  it.each([
    ["- name\n- description", 2],
    ["name: [unterminated", 3],
    [`${validFrontmatter}\nname: repeated`, 4],
  ])("reports YAML syntax, duplicate keys, and non-mapping frontmatter", (yaml, line) => {
    expect(lintMarkdown(skillDocument(yaml), { kind: "skill" }).diagnostics).toEqual([
      expect.objectContaining({ code: "invalid-frontmatter", severity: "error", line }),
    ]);
  });

  it.each([
    "", "null", "123", "[]", '"Bad-Skill"', '"bad_skill"', '"-skill"', '"skill-"',
    '"bad--skill"', '"bad skill"', '"café"', '"skill\\n"', `"${"x".repeat(65)}"`,
  ])("rejects an invalid name value %j", (name) => {
    const markdown = skillDocument(`name: ${name}\ndescription: ${validDescription}`);

    expect(lintMarkdown(markdown, { kind: "skill" }).diagnostics).toEqual([
      expect.objectContaining({ code: "invalid-skill-name", severity: "error", line: 2 }),
    ]);
  });

  it("reports both required fields when absent from a mapping", () => {
    const { diagnostics } = lintMarkdown(skillDocument("license: MIT"), { kind: "skill" });

    expect(diagnostics.map(({ code, severity, line }) => [code, severity, line])).toEqual([
      ["invalid-skill-name", "error", 1],
      ["invalid-skill-description", "error", 1],
    ]);
  });

  it.each(["", "null", "true", "[]", '"  "', `"${"x".repeat(1025)}"`])("rejects an invalid description value %j", (description) => {
    const markdown = skillDocument(`name: migration-guard\ndescription: ${description}`);

    expect(lintMarkdown(markdown, { kind: "skill" }).diagnostics).toEqual([
      expect.objectContaining({ code: "invalid-skill-description", severity: "error", line: 3 }),
    ]);
  });

  it("accepts the maximum name and description lengths, counting Unicode characters", () => {
    const description = `${validDescription} ${"🌱".repeat(1023 - validDescription.length)}`;
    const markdown = skillDocument(`name: ${"x".repeat(64)}\ndescription: "${description}"`);

    expect(lintMarkdown(markdown, { kind: "skill" }).diagnostics).toEqual([]);
  });

  it("preserves YAML block chomping when validating description length", () => {
    const description = validDescription.padEnd(1024, "x");
    const frontmatter = `name: migration-guard\ndescription: |\n  ${description}`;

    expect(lintMarkdown(skillDocument(frontmatter), { kind: "skill" }).diagnostics).toEqual([
      expect.objectContaining({ code: "invalid-skill-description", severity: "error", line: 3 }),
    ]);
    expect(lintMarkdown(skillDocument(frontmatter.replace("description: |", "description: |-")), { kind: "skill" }).diagnostics).toEqual([]);
  });

  it.each([
    ["Summarizes a change.", ["missing-skill-trigger"]],
    ["Use when reviewing a pull request.", ["missing-skill-purpose"]],
    ["Use when needed.", ["missing-skill-purpose", "missing-skill-trigger"]],
    ["When reviewing a pull request, summarize risks.", []],
    ["Use for pull requests. Summarize compatibility risks.", []],
  ])("checks for a concrete purpose and trigger in %j", (description, codes) => {
    const markdown = skillDocument(`name: review-helper\ndescription: ${description}`);
    const { diagnostics } = lintMarkdown(markdown, { kind: "skill" });

    expect(diagnostics.map(({ code }) => code)).toEqual(codes);
    expect(diagnostics.every(({ severity, line, suggestion }) => severity === "warning" && line === 3 && suggestion)).toBe(true);
  });

  it("warns only when the skill exceeds 500 physical lines", () => {
    const skill = skillDocument(validFrontmatter);
    const lineCount = lintMarkdown(skill, { kind: "skill" }).metrics.lineCount;
    const atLimit = skill + "\n".repeat(500 - lineCount);

    expect(lintMarkdown(atLimit, { kind: "skill" }).diagnostics).toEqual([]);
    expect(lintMarkdown(`${atLimit}\n`, { kind: "skill" }).diagnostics).toEqual([
      expect.objectContaining({ code: "skill-size", severity: "warning", suggestion: expect.stringContaining("helper files") }),
    ]);
  });

  it("warns only when the skill exceeds 2,500 estimated tokens at a low line count", () => {
    const atLimit = skillDocument(validFrontmatter).padEnd(10_000, "x");

    expect(lintMarkdown(atLimit, { kind: "skill" }).diagnostics).toEqual([]);
    expect(lintMarkdown(`${atLimit}x`, { kind: "skill" }).diagnostics).toEqual([
      expect.objectContaining({ code: "skill-size", severity: "warning" }),
    ]);
  });

  it("keeps the size warning when frontmatter is invalid", () => {
    expect(lintMarkdown("x".repeat(10_001), { kind: "skill" }).diagnostics.map(({ code }) => code)).toEqual([
      "missing-frontmatter", "skill-size",
    ]);
  });
});
