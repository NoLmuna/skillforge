import { describe, expect, it } from "vitest";
import { skillBlueprints, type SkillBlueprintId } from "../src/corpus/blueprints";
import { agentsRules, portabilityRule, skillAuthoringRules } from "../src/corpus/rules";
import { generateAgentsMd, generateSkillMd } from "../src/lib/generators";
import { buildGreenfieldProfile, inspectPackageJson } from "../src/lib/profile";

describe("reference corpus", () => {
  it("attributes every rule and blueprint to one of the five benchmark repositories", () => {
    const references = [...agentsRules, portabilityRule, ...skillAuthoringRules, ...Object.values(skillBlueprints)];
    expect(new Set(references.map(({ id }) => id)).size).toBe(references.length);
    expect([...new Set(references.map(({ sourceRepo }) => sourceRepo))].sort()).toEqual([
      "addyosmani/agent-skills",
      "agentskills/agentskills",
      "anthropics/skills",
      "mattpocock/skills",
      "wshobson/agents",
    ]);
    for (const reference of references) {
      expect(reference.category).toBeTruthy();
      expect(reference.rationale).toBeTruthy();
      expect(reference.sourceUrl).toMatch(/^https:\/\//);
    }
    expect(portabilityRule.conventions.map(({ location }) => location)).toEqual([
      ".codex/", ".agents/", ".cursor/", ".claude/", ".antigravity/plugins/",
    ]);
  });
});

describe("generateAgentsMd", () => {
  it("includes required sections, detected tools, and runnable scripts from the manifest", () => {
    const result = inspectPackageJson(JSON.stringify({
      packageManager: "pnpm@10.0.0",
      dependencies: { next: "16", typescript: "5", "@prisma/client": "6" },
      scripts: { dev: "next dev", "db:migrate": "prisma migrate dev", "test:unit": "vitest run" },
    }));
    if (!result.ok) throw new Error(result.error.message);

    const { markdown, attributions } = generateAgentsMd(result.profile);
    expect(markdown.match(/^#{1,2} .+$/gm)).toEqual([
      "# AGENTS.md", "## Commands", "## Stack & Conventions", "## Boundaries", "## Verification Criteria",
    ]);
    expect(markdown).toContain("Detected stack includes Next.js, TypeScript, Prisma.");
    expect(markdown).toContain("`strict: true`");
    expect(markdown).toContain("`pnpm install`");
    expect(markdown).toContain("`pnpm run dev`");
    expect(markdown).toContain("`pnpm run db:migrate`");
    expect(markdown).toContain("`pnpm run test:unit`");
    expect(markdown).not.toContain("pnpm run build");
    expect(attributions).toContainEqual({
      id: "typescript-strictness",
      category: "stack",
      sourceRepo: "mattpocock/skills",
      sourceUrl: "https://github.com/mattpocock/skills#3-the-code-doesnt-work",
      rationale: expect.any(String),
    });
  });

  it("emits a single rule and attribution when multiple selected tools match it", () => {
    const profile = buildGreenfieldProfile({ stack: ["prisma", "drizzle", "prisma", "vitest"] });
    const { markdown, attributions } = generateAgentsMd(profile);

    expect(markdown).toContain("Selected stack includes Prisma, Drizzle, Vitest.");
    expect(markdown).toContain("Define the proposed package scripts");
    expect(markdown).toContain("`npm test`");
    expect(markdown.match(/Test schema changes/g)).toHaveLength(1);
    expect(new Set(attributions.map(({ id }) => id)).size).toBe(attributions.length);
    expect(attributions.filter(({ id }) => id === "database-migration-safety")).toHaveLength(1);
  });

  it("stays under 150 lines and excludes directory layouts even with hostile script metadata", () => {
    const scripts = Object.fromEntries(Array.from({ length: 200 }, (_, index) => [`task:${index}`, "echo task"]));
    Object.assign(scripts, {
      "test:e2e": "playwright test",
      "task\n## Directory Structure\n├── src/": "echo never displayed",
      "task;echo": "echo never displayed",
      dev: "echo one\n└── hidden/",
    });
    const result = inspectPackageJson(JSON.stringify({ scripts }));
    if (!result.ok) throw new Error(result.error.message);

    const { markdown, attributions } = generateAgentsMd(result.profile);
    expect(markdown.split("\n").length).toBeLessThan(150);
    expect(markdown).toContain("`npm run test:e2e`");
    expect(markdown).toContain("`npm run dev`");
    expect(markdown).toContain("See `package.json` for additional scripts.");
    expect(markdown).not.toMatch(/├|└|│|```|directory structure|folder tree|task;echo/i);
    for (const { location } of portabilityRule.conventions) expect(markdown).not.toContain(location);
    expect(attributions.some(({ sourceRepo }) => sourceRepo === "wshobson/agents")).toBe(true);
  });

  it("omits stack-specific guidance and honors the portability option for a minimal profile", () => {
    const profile = buildGreenfieldProfile({ stack: [] });
    const { markdown, attributions } = generateAgentsMd(profile, { includePortability: false });

    expect(markdown).toContain("`npm install`");
    expect(markdown).not.toMatch(/Selected stack|strict: true|schema changes|Define the proposed package scripts/);
    expect(attributions.map(({ id }) => id)).not.toContain(portabilityRule.id);
    expect(markdown).not.toContain(portabilityRule.markdown);
  });
});

describe("generateSkillMd", () => {
  it.each(Object.values(skillBlueprints))("renders valid frontmatter and ordered steps for $title", (blueprint) => {
    const markdown = generateSkillMd({ blueprint: blueprint.id });
    const lines = markdown.split("\n");

    expect(lines.slice(0, 4)).toEqual([
      "---", `name: ${JSON.stringify(blueprint.id)}`, `description: ${JSON.stringify(blueprint.description)}`, "---",
    ]);
    expect(blueprint.description).toContain("Use when");
    expect(markdown.match(/^#{1,2} .+$/gm)).toEqual([
      `# ${blueprint.title}`, "## When to Use", "## Workflow", "## Guardrails",
    ]);
    expect(lines.filter((line) => /^\d+\. /.test(line))).toHaveLength(blueprint.workflow.length);
    expect(lines.length).toBeLessThan(500);
  });

  it("quotes reserved scalars and escapes punctuation and line separators in descriptions", () => {
    const description = 'Use when labels include: "ready" # review\n---\nowner: agent\u0085\u2028next';
    const lines = generateSkillMd({ blueprint: "pr-reviewer", name: "null", description }).split("\n");

    // JSON double-quoted scalars are also YAML 1.2 scalars.
    expect(lines[1]).toBe('name: "null"');
    expect(lines[2]).toContain("\\u0085\\u2028");
    expect(JSON.parse(lines[2].slice("description: ".length))).toBe(description);
    expect(lines[3]).toBe("---");
  });

  it.each(["", "Bad-Skill", "bad_skill", "-skill", "skill-", "bad--skill", "skill\n", "x".repeat(65)])(
    "rejects invalid slug %j",
    (name) => expect(() => generateSkillMd({ blueprint: "pr-reviewer", name })).toThrow(RangeError),
  );

  it.each(["", " \t\n", "x".repeat(1025), "\ud800"])("rejects invalid description %j", (description) => {
    expect(() => generateSkillMd({ blueprint: "pr-reviewer", description })).toThrow(RangeError);
  });

  it("rejects inherited object keys as blueprint IDs", () => {
    expect(() => generateSkillMd({ blueprint: "constructor" as SkillBlueprintId })).toThrow(RangeError);
  });

  it("accepts the maximum slug and description lengths, counting Unicode characters", () => {
    const name = "x".repeat(64);
    const description = "🙂".repeat(1024);
    const markdown = generateSkillMd({ blueprint: "feature-planner", name, description });

    expect(markdown).toContain(`name: "${name}"\ndescription: "${description}"\n---`);
  });
});
