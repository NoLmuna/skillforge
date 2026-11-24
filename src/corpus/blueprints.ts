import type { RuleAttribution } from "./rules";

export type SkillBlueprintId = "feature-planner" | "pr-reviewer" | "bug-investigator" | "migration-guard";

export interface SkillBlueprint extends RuleAttribution {
  readonly id: SkillBlueprintId;
  readonly category: "skill-blueprint";
  readonly title: string;
  readonly description: string;
  readonly whenToUse: string;
  readonly workflow: readonly string[];
  readonly guardrails: readonly string[];
}

export const skillBlueprints: Readonly<Record<SkillBlueprintId, SkillBlueprint>> = {
  "feature-planner": {
    id: "feature-planner",
    category: "skill-blueprint",
    sourceRepo: "mattpocock/skills",
    sourceUrl: "https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md",
    rationale: "A scoped specification makes a feature easier to implement and verify in small slices.",
    title: "Feature Planner",
    description: "Turn a feature request into a scoped implementation plan with acceptance criteria. Use when asked to plan a feature, draft a technical spec, or break down a change into deliverable steps.",
    whenToUse: "Use this skill when a feature needs a plan before implementation or existing requirements need measurable acceptance criteria.",
    workflow: [
      "Identify the user outcome, the current behavior, and the constraints that affect the design.",
      "Write acceptance criteria for the main path and relevant failure paths. Record unresolved decisions that affect scope.",
      "Sequence small, independently verifiable changes and identify their dependencies.",
      "Deliver the plan with the verification step and expected result for each change.",
    ],
    guardrails: [
      "Keep implementation work out of a planning-only request.",
      "Label assumptions and cite the repository evidence behind the plan.",
    ],
  },
  "pr-reviewer": {
    id: "pr-reviewer",
    category: "skill-blueprint",
    sourceRepo: "addyosmani/agent-skills",
    sourceUrl: "https://github.com/addyosmani/agent-skills/blob/main/skills/code-review-and-quality/SKILL.md",
    rationale: "Reviewing the diff against requirements and caller behavior makes findings actionable.",
    title: "PR Reviewer",
    description: "Review a pull request or code diff for regressions, missing tests, and maintainability issues. Use when asked to review a PR, assess merge readiness, or give actionable code review feedback.",
    whenToUse: "Use this skill for a pull request, a proposed patch, or a diff before merge.",
    workflow: [
      "Read the change requirements and diff. Identify affected callers and the behavior each change is meant to preserve.",
      "Check correctness, readability, architecture, security, and performance against the affected paths.",
      "Inspect regression coverage and run the relevant project checks when possible.",
      "Report confirmed findings in severity order, with a file location, impact, and the condition that triggers each issue.",
    ],
    guardrails: [
      "Check findings against existing guards and caller behavior before reporting them.",
      "Report which checks ran and identify any conclusions that remain unverified.",
    ],
  },
  "bug-investigator": {
    id: "bug-investigator",
    category: "skill-blueprint",
    sourceRepo: "mattpocock/skills",
    sourceUrl: "https://github.com/mattpocock/skills/blob/main/skills/engineering/diagnosing-bugs/SKILL.md",
    rationale: "A reproducible failure lets the investigator test hypotheses and prove the fix.",
    title: "Bug Investigator",
    description: "Reproduce an unexpected behavior, isolate its root cause, and verify a fix. Use when asked to diagnose a bug, investigate a regression, or explain a failing test.",
    whenToUse: "Use this skill when actual behavior differs from expected behavior and the cause is unclear.",
    workflow: [
      "Record the expected and observed behavior. Find the smallest reliable reproduction in a safe environment.",
      "Rank hypotheses and test them one at a time using a focused check or targeted instrumentation.",
      "Turn the reproduction into a regression test when feasible. Prove it fails for the expected reason before changing behavior.",
      "Verify the fix with the reproduction and related checks. Summarize the cause and the evidence.",
    ],
    guardrails: [
      "Use sanitized inputs and avoid exposing credentials or production data in diagnostic output.",
      "Report any remaining uncertainty if the failure cannot be reproduced.",
    ],
  },
  "migration-guard": {
    id: "migration-guard",
    category: "skill-blueprint",
    sourceRepo: "addyosmani/agent-skills",
    sourceUrl: "https://github.com/addyosmani/agent-skills/blob/main/skills/deprecation-and-migration/SKILL.md",
    rationale: "Compatibility checks and a recovery plan reduce the risk of irreversible changes.",
    title: "Migration Guard",
    description: "Plan and verify a staged migration with compatibility checks and a recovery path. Use when asked to assess a schema change, migrate stored data, deprecate an API, or upgrade an integration with breaking changes.",
    whenToUse: "Use this skill when a migration can affect existing data, consumers, or deployed versions.",
    workflow: [
      "Inventory affected data and consumers. Identify versions that must coexist and operations that are irreversible.",
      "Plan compatible rollout stages. Define how to verify each stage and how to roll back or recover from a partial failure.",
      "Rehearse the migration with representative data. Check data integrity, compatibility, and safe retries.",
      "Document rollout order, stop conditions, recovery steps, and the evidence required before removing compatibility support.",
    ],
    guardrails: [
      "Confirm recovery procedures before destructive or irreversible steps.",
      "Keep production execution subject to the project's release controls.",
    ],
  },
};
