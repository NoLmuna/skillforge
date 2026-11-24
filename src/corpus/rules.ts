import type { Technology } from "../lib/profile";

export type SourceRepo =
  | "agentskills/agentskills"
  | "mattpocock/skills"
  | "addyosmani/agent-skills"
  | "anthropics/skills"
  | "wshobson/agents";

export type AgentsRuleCategory = "commands" | "stack" | "boundaries" | "verification";
export type RuleCategory = AgentsRuleCategory | "skill-authoring" | "skill-blueprint";

export interface RuleAttribution {
  readonly id: string;
  readonly category: RuleCategory;
  readonly sourceRepo: SourceRepo;
  readonly sourceUrl: string;
  readonly rationale: string;
}

export interface CorpusRule extends RuleAttribution {
  readonly markdown: string;
}

export interface AgentsRule extends CorpusRule {
  readonly category: AgentsRuleCategory;
  readonly technologies?: readonly Technology[];
}

interface PortabilityConvention {
  readonly target: string;
  readonly location: string;
}

interface PortabilityRule extends AgentsRule {
  readonly conventions: readonly PortabilityConvention[];
}

const mattSkills = "https://github.com/mattpocock/skills";
const addySkills = "https://github.com/addyosmani/agent-skills/blob/main/skills";
const skillCreator = "https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md";
const specification = "https://agentskills.io/specification";

export const agentsRules: readonly AgentsRule[] = [
  {
    id: "executable-project-commands",
    category: "commands",
    sourceRepo: "mattpocock/skills",
    sourceUrl: `${mattSkills}/blob/main/skills/engineering/diagnosing-bugs/SKILL.md`,
    rationale: "Repeatable checks require an exact entry point another contributor can run.",
    markdown: "Use the project's package scripts. Record the exact command for any new verification step.",
  },
  {
    id: "typescript-strictness",
    category: "stack",
    sourceRepo: "mattpocock/skills",
    sourceUrl: `${mattSkills}#3-the-code-doesnt-work`,
    rationale: "Strict TypeScript applies the source's static typing feedback loop to TypeScript projects.",
    technologies: ["typescript"],
    markdown: "Use TypeScript with `strict: true`. Narrow unknown inputs at boundaries and define explicit types for public interfaces.",
  },
  {
    id: "review-quality",
    category: "stack",
    sourceRepo: "addyosmani/agent-skills",
    sourceUrl: `${addySkills}/code-review-and-quality/SKILL.md`,
    rationale: "A review rubric catches defects that a passing test suite may miss.",
    markdown: "Review changes for correctness, readability, architecture, security, and performance.",
  },
  {
    id: "protect-sensitive-data",
    category: "boundaries",
    sourceRepo: "addyosmani/agent-skills",
    sourceUrl: `${addySkills}/security-and-hardening/SKILL.md`,
    rationale: "Secrets and production data can leak through source, fixtures, and logs.",
    markdown: "Keep credentials in approved secret stores. Use sanitized fixtures and redact sensitive values from logs.",
  },
  {
    id: "database-migration-safety",
    category: "boundaries",
    sourceRepo: "addyosmani/agent-skills",
    sourceUrl: `${addySkills}/deprecation-and-migration/SKILL.md`,
    rationale: "Staged migrations make compatibility and recovery verifiable before rollout.",
    technologies: ["prisma", "drizzle"],
    markdown: "Test schema changes against representative data and verify the rollback or recovery path before rollout.",
  },
  {
    id: "focused-test-loop",
    category: "verification",
    sourceRepo: "mattpocock/skills",
    sourceUrl: `${mattSkills}/blob/main/skills/engineering/tdd/SKILL.md`,
    rationale: "A focused failing test proves the check can catch the intended behavior change.",
    markdown: "For behavior changes, start with one failing test, make the smallest change that passes, then refactor with the test green.",
  },
  {
    id: "verify-edge-cases",
    category: "verification",
    sourceRepo: "addyosmani/agent-skills",
    sourceUrl: `${addySkills}/code-review-and-quality/SKILL.md`,
    rationale: "Boundary values and failure paths expose defects that happy-path tests miss.",
    markdown: "Exercise empty inputs, boundary values, and failure paths where relevant. Run the applicable repository checks and report their results.",
  },
];

export const portabilityRule: PortabilityRule = {
  id: "shared-agent-instructions",
  category: "stack",
  sourceRepo: "wshobson/agents",
  sourceUrl: "https://github.com/wshobson/agents/blob/main/docs/harnesses.md",
  rationale: "One Markdown source keeps instructions consistent across tools with different discovery conventions.",
  markdown: "Maintain one shared Markdown source for agent instructions. Keep tool-specific configuration in each tool's native format.",
  conventions: [
    { target: "Codex CLI", location: ".codex/" },
    { target: "Shared Agent Skills", location: ".agents/" },
    { target: "Cursor", location: ".cursor/" },
    { target: "Claude Code", location: ".claude/" },
    { target: "Antigravity CLI", location: ".antigravity/plugins/" },
  ],
};

export const skillFrontmatter = {
  nameMaxLength: 64,
  namePattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  descriptionMaxLength: 1024,
} as const;

export const skillAuthoringRules: readonly CorpusRule[] = [
  {
    id: "skill-frontmatter",
    category: "skill-authoring",
    sourceRepo: "agentskills/agentskills",
    sourceUrl: `${specification}#frontmatter`,
    rationale: "Clients use the frontmatter to discover and identify skills consistently.",
    markdown: `Start \`SKILL.md\` with YAML frontmatter containing \`name\` and \`description\`. Use a lowercase alphanumeric slug with single hyphens and at most ${skillFrontmatter.nameMaxLength} characters, matching the parent directory name. Keep the nonempty description within ${skillFrontmatter.descriptionMaxLength} characters.`,
  },
  {
    id: "progressive-disclosure",
    category: "skill-authoring",
    sourceRepo: "agentskills/agentskills",
    sourceUrl: `${specification}#progressive-disclosure`,
    rationale: "Agents can load detailed material when they need it, keeping activation context small.",
    markdown: "Keep the main skill under 500 lines. Put detailed examples and supporting material in focused references and link to them from the workflow.",
  },
  {
    id: "skill-trigger-phrasing",
    category: "skill-authoring",
    sourceRepo: "anthropics/skills",
    sourceUrl: `${skillCreator}#write-the-skillmd`,
    rationale: "Concrete trigger phrases help agents recognize relevant requests during discovery.",
    markdown: "Describe the skill's outcome and name the tasks, user phrases, or situations that should trigger it in `description`.",
  },
  {
    id: "skill-ordered-workflow",
    category: "skill-authoring",
    sourceRepo: "anthropics/skills",
    sourceUrl: `${skillCreator}#creating-a-skill`,
    rationale: "Ordered, observable steps make execution and validation repeatable.",
    markdown: "Present the workflow in imperative steps. State what evidence to collect and what to deliver at the end.",
  },
];
