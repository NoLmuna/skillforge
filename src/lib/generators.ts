import { skillBlueprints, type SkillBlueprintId } from "../corpus/blueprints";
import {
  agentsRules,
  portabilityRule,
  skillFrontmatter,
  type AgentsRuleCategory,
  type RuleAttribution,
} from "../corpus/rules";
import { technologyNames, type ProjectProfile } from "./profile";

export interface GenerateAgentsOptions {
  readonly includePortability?: boolean;
  readonly strictTypes?: boolean;
  readonly testFirst?: boolean;
  readonly protectedPaths?: readonly string[];
  readonly customRules?: readonly string[];
}

export interface GeneratedAgentsMd {
  readonly markdown: string;
  readonly attributions: readonly RuleAttribution[];
}

export interface GenerateSkillInput {
  readonly blueprint: SkillBlueprintId;
  readonly name?: string;
  readonly description?: string;
  readonly workflow?: readonly string[];
  readonly guardrails?: readonly string[];
}

const primaryScripts = ["dev", "start", "typecheck", "lint", "test", "check", "build"];
const maxListedScripts = 20;

function renderCommands(profile: ProjectProfile): string[] {
  // Only interpolate script names that are a single shell-safe, Markdown-safe argument.
  const scriptNames = Object.keys(profile.scripts)
    .filter((name) => /^[a-z0-9_][a-z0-9_.:-]*$/i.test(name) && profile.scripts[name].trim())
    .sort();
  const extraScripts = scriptNames.filter((name) => !primaryScripts.includes(name));
  const verificationScripts = /^(?:type-?check|lint|test|check|format)(?:[.:-]|$)/;
  const orderedScripts = [
    ...primaryScripts.filter((name) => scriptNames.includes(name)),
    ...extraScripts.filter((name) => verificationScripts.test(name)),
    ...extraScripts.filter((name) => !verificationScripts.test(name)),
  ];

  const { packageManager } = profile;
  const commands = [`- Install dependencies with \`${packageManager} install\`.`];
  if (profile.source === "greenfield" && orderedScripts.length > 0) {
    commands.push("- Define the proposed package scripts before using the commands below.");
  }
  for (const script of orderedScripts.slice(0, maxListedScripts)) {
    const command = packageManager === "npm" && script === "test" ? "npm test" : `${packageManager} run ${script}`;
    commands.push(`- \`${command}\``);
  }
  if (orderedScripts.length > maxListedScripts) commands.push("- See `package.json` for additional scripts.");

  return commands;
}

export function generateAgentsMd(
  profile: ProjectProfile,
  options: GenerateAgentsOptions = {},
): GeneratedAgentsMd {
  const stack = new Set(profile.stack);
  const sections: Record<AgentsRuleCategory, string[]> = {
    commands: renderCommands(profile),
    stack: [],
    boundaries: [],
    verification: [],
  };

  if (stack.size > 0) {
    const tools = [...stack].map((tool) => technologyNames[tool]);
    sections.stack.push(`- ${profile.source === "greenfield" ? "Selected" : "Detected"} stack includes ${tools.join(", ")}.`);
  }

  const rules = options.includePortability === false ? agentsRules : [...agentsRules, portabilityRule];
  const attributions = new Map<string, RuleAttribution>();
  const includedText = new Set<string>();
  for (const { id, category, sourceRepo, sourceUrl, rationale, markdown, technologies } of rules) {
    if (id === "typescript-strictness" && options.strictTypes === false) continue;
    if (id === "focused-test-loop" && options.testFirst === false) continue;
    if (technologies && !technologies.some((tool) => stack.has(tool))) continue;
    const ruleText = markdown.trim();
    if (attributions.has(id) || includedText.has(ruleText)) continue;

    sections[category].push(`- ${ruleText}`);
    includedText.add(ruleText);
    attributions.set(id, { id, category, sourceRepo, sourceUrl, rationale });
  }

  const additions = [
    ...(options.protectedPaths ?? []).filter(path => path.trim()).map(path => `Preserve the protected path \`${path.trim()}\`.`),
    ...(options.customRules ?? []),
  ];
  for (const entry of additions) {
    const rule = entry.trim();
    if (!rule || includedText.has(rule)) continue;
    if (/[\r\n]|[├└]──|(?:^|\s)[|`+\\]--/.test(rule)) {
      throw new RangeError("Enter one rule or protected path per line and omit directory trees.");
    }
    sections.boundaries.push(`- ${rule}`);
    includedText.add(rule);
  }

  const markdown = [
    "# AGENTS.md",
    "",
    "## Commands",
    ...sections.commands,
    "",
    "## Stack & Conventions",
    ...sections.stack,
    "",
    "## Boundaries",
    ...sections.boundaries,
    "",
    "## Verification Criteria",
    ...sections.verification,
    "",
  ].join("\n");

  if (markdown.split("\n").length >= 150) throw new RangeError("Shorten the custom configuration to keep AGENTS.md under 150 lines.");
  return { markdown, attributions: [...attributions.values()] };
}

function yamlString(value: string): string {
  // Escape YAML line breaks and non-printable characters that JSON permits unescaped.
  return JSON.stringify(value).replace(/[\u007f-\u009f\u2028\u2029\ufeff\ufffe\uffff]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export function generateSkillMd(input: GenerateSkillInput): string {
  if (!Object.hasOwn(skillBlueprints, input.blueprint)) {
    throw new RangeError("Choose a supported skill blueprint.");
  }

  const blueprint = skillBlueprints[input.blueprint];
  const name = input.name ?? blueprint.id;
  const description = input.description ?? blueprint.description;
  if (name.length > skillFrontmatter.nameMaxLength || !skillFrontmatter.namePattern.test(name)) {
    throw new RangeError("Skill name must be 1–64 characters of lowercase ASCII letters, digits, and single hyphens between segments.");
  }
  if (
    !description.trim() ||
    Array.from(description).length > skillFrontmatter.descriptionMaxLength ||
    /[\uD800-\uDFFF]/u.test(description)
  ) {
    throw new RangeError("Skill description must contain text and use at most 1024 Unicode characters.");
  }

  return [
    "---",
    `name: ${yamlString(name)}`,
    `description: ${yamlString(description)}`,
    "---",
    "",
    `# ${blueprint.title}`,
    "",
    "## When to Use",
    blueprint.whenToUse,
    "",
    "## Workflow",
    ...(input.workflow ?? blueprint.workflow).map((step, index) => `${index + 1}. ${step}`),
    "",
    "## Guardrails",
    ...(input.guardrails ?? blueprint.guardrails).map((guardrail) => `- ${guardrail}`),
    "",
  ].join("\n");
}
