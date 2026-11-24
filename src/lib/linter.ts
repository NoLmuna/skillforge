import { isAlias, isMap, isNode, isScalar, LineCounter, parseDocument } from "yaml";
import { skillFrontmatter } from "../corpus/rules";
import type { ProjectProfile } from "./profile";

export type TokenBudgetStatus = "optimal" | "heavy" | "bloated";

export interface MarkdownMetrics {
  readonly lineCount: number;
  readonly characterCount: number;
  readonly estimatedTokens: number;
  readonly budgetStatus: TokenBudgetStatus;
}

export type LintDiagnosticCode =
  | "vague-phrase"
  | "directory-tree"
  | "missing-script"
  | "missing-frontmatter"
  | "invalid-frontmatter"
  | "invalid-skill-name"
  | "invalid-skill-description"
  | "missing-skill-purpose"
  | "missing-skill-trigger"
  | "skill-size";

export interface LintDiagnostic {
  readonly code: LintDiagnosticCode;
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly suggestion: string;
  /** One-based line number. Document-wide diagnostics omit it. */
  readonly line?: number;
}

export interface LintOptions {
  readonly kind: "agents" | "skill";
  readonly profile?: ProjectProfile;
}

export interface LintResult {
  readonly metrics: MarkdownMetrics;
  readonly diagnostics: readonly LintDiagnostic[];
}

interface VaguePhraseRule {
  readonly pattern: RegExp;
  readonly suggestion: string;
}

const vaguePhrases: readonly VaguePhraseRule[] = [
  {
    pattern: /\bwrite\s+clean\s+code\b/i,
    suggestion: "Name the formatter or lint rule and give the command that checks it.",
  },
  {
    pattern: /\b(?:follow|use)\s+best\s+practices\b/i,
    suggestion: "State the project convention directly and give an example of where it applies.",
  },
  {
    pattern: /\bmake\s+sure\s+everything\s+works\b/i,
    suggestion: "List the verification commands and the expected outcome for each one.",
  },
  {
    pattern: /\bwrite\s+bug(?:\s+|[-‐‑])free\s+code\b/i,
    suggestion: "Name the edge cases to cover with tests and give the command that runs them.",
  },
];

const directoryBranch = /^\s*(?:[│|]\s*)*(?:[├└]──|[|+`\\]--(?=\s|$))/;
// Match explicit run commands with quoted or bare script names, plus npm lifecycle shortcuts.
const scriptReference = /(?<![\w./-])(?:(?:npm[ \t]+run(?:-script)?|(?:pnpm|yarn|bun)[ \t]+run)[ \t]+(?:"([^"]+)"|'([^']+)'|([@\w](?:[\w.:/@-]*[\w:/@-])?))|npm[ \t]+(test|start|stop|restart|t|tst)(?![\w:-]|\.[\w]))/g;

function estimateSize(markdown: string, lineCount: number): MarkdownMetrics {
  const characterCount = Array.from(markdown).length;
  // One estimated token per four Unicode code points, rounded up.
  const estimatedTokens = Math.ceil(characterCount / 4);
  const budgetStatus = estimatedTokens <= 1000 ? "optimal" : estimatedTokens <= 1800 ? "heavy" : "bloated";
  return { lineCount, characterCount, estimatedTokens, budgetStatus };
}

function lintAgents(lines: readonly string[], profile?: ProjectProfile): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  for (const [index, text] of lines.entries()) {
    const line = index + 1;
    for (const { pattern, suggestion } of vaguePhrases) {
      const match = pattern.exec(text);
      if (match) {
        diagnostics.push({
          code: "vague-phrase",
          severity: "warning",
          line,
          message: `“${match[0]}” gives the agent little concrete guidance.`,
          suggestion,
        });
      }
    }

    if (directoryBranch.test(text)) {
      diagnostics.push({
        code: "directory-tree",
        severity: "warning",
        line,
        message: "Directory trees can go stale when files move.",
        suggestion: "Remove the tree and reference only the specific files needed for an instruction.",
      });
    }

    if (!profile) continue;
    for (const [command, doubleQuoted, singleQuoted, bare, shortcut] of text.matchAll(scriptReference)) {
      const script = doubleQuoted ?? singleQuoted ?? bare ?? (shortcut === "t" || shortcut === "tst" ? "test" : shortcut);
      if (Object.hasOwn(profile.scripts, script)) continue;

      diagnostics.push({
        code: "missing-script",
        severity: "warning",
        line,
        message: `“${command}” references the missing package script “${script}”.`,
        suggestion: "Use an existing script from package.json or define this script before documenting the command.",
      });
    }
  }

  return diagnostics;
}

function lintDescription(description: string, line: number): LintDiagnostic[] {
  const text = description.trim().replace(/\s+/g, " ");
  const cue = /\b(?:(?:use|apply|activate|run)(?: (?:this skill|this|it))? (?:when(?:ever)?|if|for)|trigger(?:ed|s)? (?:when|on|by)|when(?:ever)?|if)\b|^for\b/i.exec(text);
  const beforeCue = cue ? text.slice(0, cue.index) : text;
  const [trigger, ...afterTrigger] = cue
    ? text.slice(cue.index + cue[0].length).trim().split(/[,;:.!?](?:\s+|$)/)
    : [""];
  const purpose = `${beforeCue} ${afterTrigger.join(" ")}`.replace(/^[\s.,;:!?-]+|[\s.,;:!?-]+$/g, "");
  const diagnostics: LintDiagnostic[] = [];

  if (!purpose || /^(?:this skill|a skill|use this skill|helps)$/i.test(purpose)) {
    diagnostics.push({
      code: "missing-skill-purpose",
      severity: "warning",
      line,
      message: "The description appears to leave out what the skill does.",
      suggestion: "Name the action the skill performs and the outcome it delivers.",
    });
  }
  if (!trigger || /^(?:(?:it is |they are |the user )?(?:needed|appropriate|relevant|applicable|asks|asked|requested|required)|necessary|needed by the user)$/i.test(trigger)) {
    diagnostics.push({
      code: "missing-skill-trigger",
      severity: "warning",
      line,
      message: "The description could use a concrete trigger.",
      suggestion: "Name a user request or situation that should activate the skill, such as “Use when asked to review a pull request.”",
    });
  }

  return diagnostics;
}

function lintFrontmatter(lines: readonly string[]): LintDiagnostic[] {
  const delimiter = /^---[ \t]*$/;
  const hasOpening = delimiter.test(lines[0]?.replace(/^\uFEFF/, "") ?? "");
  const closing = hasOpening ? lines.findIndex((line, index) => index > 0 && delimiter.test(line)) : -1;
  if (closing < 0) {
    return [{
      code: "missing-frontmatter",
      severity: "error",
      line: 1,
      message: hasOpening ? "YAML frontmatter is missing its closing delimiter." : "SKILL.md must start with YAML frontmatter.",
      suggestion: "Put name and description at the top of the file between two `---` delimiter lines.",
    }];
  }

  const lineCounter = new LineCounter();
  const header = `${lines.slice(1, closing).join("\n")}\n`;
  const document = parseDocument(header, { lineCounter, prettyErrors: false });
  const syntaxError = document.errors[0] ?? document.warnings[0];
  if (syntaxError || !isMap(document.contents)) {
    return [{
      code: "invalid-frontmatter",
      severity: "error",
      line: syntaxError ? lineCounter.linePos(syntaxError.pos[0]).line + 1 : 2,
      message: syntaxError?.message ?? "YAML frontmatter must contain a mapping of fields to values.",
      suggestion: "Use valid YAML with one key per metadata field, including name and description.",
    }];
  }

  const diagnostics: LintDiagnostic[] = [];
  for (const key of ["name", "description"] as const) {
    const field = document.get(key, true);
    // Resolve scalar aliases without expanding arbitrary YAML objects.
    const scalar = isAlias(field) ? field.resolve(document) : field;
    const value = isScalar(scalar) && typeof scalar.value === "string" ? scalar.value : "";
    const line = isNode(field) && field.range ? lineCounter.linePos(field.range[0]).line + 1 : 1;
    if (key === "name") {
      if (value.length <= skillFrontmatter.nameMaxLength && skillFrontmatter.namePattern.test(value)) continue;
      diagnostics.push({
        code: "invalid-skill-name",
        severity: "error",
        line,
        message: "Skill name must be a 1–64 character lowercase alphanumeric slug with single hyphens between segments.",
        suggestion: "Set name to a string such as `feature-planner` and use the same slug for the parent directory.",
      });
    } else if (!value.trim() || Array.from(value).length > skillFrontmatter.descriptionMaxLength) {
      diagnostics.push({
        code: "invalid-skill-description",
        severity: "error",
        line,
        message: "Skill description must be a non-empty string of at most 1,024 characters.",
        suggestion: "Describe the outcome and the requests that should trigger the skill in the description field.",
      });
    } else {
      diagnostics.push(...lintDescription(value, line));
    }
  }

  return diagnostics;
}

export function lintMarkdown(markdown: string, options: LintOptions): LintResult {
  const lines = markdown.split(/\r\n|\n|\r/);
  if (lines[lines.length - 1] === "") lines.pop();
  const metrics = estimateSize(markdown, lines.length);
  if (options.kind === "agents") return { metrics, diagnostics: lintAgents(lines, options.profile) };

  const diagnostics = lintFrontmatter(lines);
  if (metrics.lineCount > 500 || metrics.estimatedTokens > 2500) {
    diagnostics.push({
      code: "skill-size",
      severity: "warning",
      message: "This skill exceeds 500 lines or 2,500 estimated tokens.",
      suggestion: "Keep the core workflow in SKILL.md. Move detailed examples or procedures into helper files and link to them from the relevant steps.",
    });
  }
  return { metrics, diagnostics };
}
