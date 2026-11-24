"use client";

import { useEffect, useRef, useState } from "react";
import {
  Anvil,
  Blocks,
  Check,
  CodeXml,
  FileCode2,
  FileSearch,
  FolderGit2,
  GitFork,
  Layers3,
  Laptop,
  Plus,
  SlidersHorizontal,
  Sprout,
  Workflow,
} from "lucide-react";
import { skillBlueprints, type SkillBlueprintId } from "../corpus/blueprints";
import { skillAuthoringRules, type RuleAttribution } from "../corpus/rules";
import {
  buildGreenfieldProfile,
  inspectPackageJson,
  technologyNames,
  type PackageManager,
  type Technology,
} from "../lib/profile";
import { generateAgentsMd, generateSkillMd } from "../lib/generators";
import { lintMarkdown } from "../lib/linter";
import type { RepositoryInspection } from "../lib/github";
import OutputPane from "./output-pane";

const samples = {
  "Next.js Full-Stack App": {
    name: "web-app",
    packageManager: "pnpm@10",
    dependencies: { next: "16", react: "19", "@prisma/client": "6" },
    devDependencies: { typescript: "5", vitest: "4", tailwindcss: "4" },
    scripts: {
      dev: "next dev",
      build: "next build",
      test: "vitest run",
      typecheck: "tsc --noEmit",
    },
  },
  "TypeScript CLI Tool": {
    name: "cli-tool",
    packageManager: "npm@11",
    devDependencies: { typescript: "5", jest: "30", eslint: "9" },
    scripts: { build: "tsc", test: "jest", lint: "eslint ." },
  },
};
const modes = [
  { id: "greenfield", label: "Greenfield", icon: Sprout },
  { id: "repo", label: "Existing repo", icon: FolderGit2 },
  { id: "audit", label: "Audit file", icon: FileSearch },
] as const;
const githubExamples = [
  "mattpocock/skills",
  "agentskills/agentskills",
  "vercel/next.js",
];
const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
function blueprintFields(id: SkillBlueprintId) {
  const blueprint = skillBlueprints[id];
  return {
    id,
    name: id as string,
    description: blueprint.description,
    workflow: blueprint.workflow.join("\n"),
    guardrails: blueprint.guardrails.join("\n"),
  };
}

export default function Studio() {
  const [kind, setKind] = useState<"agents" | "skill">("agents");
  const [mode, setMode] = useState<(typeof modes)[number]["id"]>("greenfield");
  const [stack, setStack] = useState<Technology[]>([
    "nextjs",
    "react",
    "typescript",
    "tailwind",
    "vitest",
    "eslint",
  ]);
  const [manager, setManager] = useState<PackageManager>("npm");
  const [strict, setStrict] = useState(true);
  const [testing, setTesting] = useState(true);
  const [paths, setPaths] = useState("");
  const [rules, setRules] = useState("");
  const [json, setJson] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [inspection, setInspection] = useState<RepositoryInspection | null>(
    null,
  );
  const [githubError, setGithubError] = useState("");
  const [inspecting, setInspecting] = useState(false);
  const activeInspection = useRef<AbortController | null>(null);
  const tokenInput = useRef<HTMLInputElement>(null);
  const [agentsText, setAgentsText] = useState("");
  const [auditedFilename, setAuditedFilename] = useState("AGENTS.md");
  const [skillText, setSkillText] = useState("");
  const [auditSkill, setAuditSkill] = useState(false);
  const [skill, setSkill] = useState(() => blueprintFields("feature-planner"));
  useEffect(() => () => activeInspection.current?.abort(), []);

  function setManualManifest(value: string) {
    setInspection(null);
    setGithubError("");
    setJson(value);
  }

  async function inspectRepository(url: string) {
    activeInspection.current?.abort();
    const controller = new AbortController();
    activeInspection.current = controller;
    const githubToken = tokenInput.current?.value.trim();
    if (tokenInput.current) tokenInput.current.value = "";
    setGithubUrl(url);
    setGithubError("");
    setInspecting(true);
    try {
      const response = await fetch("/api/inspect-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, githubToken: githubToken || undefined }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body: { error?: { message?: string } } = await response.json();
        throw new Error(body.error?.message ?? "Repository inspection failed.");
      }
      const result: RepositoryInspection = await response.json();
      if (controller.signal.aborted) return;
      setInspection(result);
      setJson(result.packageJson ?? "");
    } catch (failure) {
      if (!controller.signal.aborted) {
        setGithubError(
          failure instanceof Error
            ? failure.message
            : "Repository inspection failed.",
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        activeInspection.current = null;
        setInspecting(false);
      }
    }
  }

  const agents = kind === "agents";
  const audit = agents ? mode === "audit" : auditSkill;
  const repo = inspectPackageJson(json);
  const profile =
    mode === "greenfield"
      ? buildGreenfieldProfile({ stack, packageManager: manager })
      : inspection
        ? (inspection.profile ?? undefined)
        : repo.ok
          ? repo.profile
          : undefined;
  let markdown = "";
  let error = "";
  let sources: readonly RuleAttribution[] = [];
  try {
    if (audit) markdown = agents ? agentsText : skillText;
    else if (!agents) {
      markdown = generateSkillMd({
        blueprint: skill.id,
        name: skill.name,
        description: skill.description,
        workflow: lines(skill.workflow),
        guardrails: lines(skill.guardrails),
      });
      sources = [skillBlueprints[skill.id], ...skillAuthoringRules];
    } else if (profile) {
      const draft = generateAgentsMd(
        profile,
        mode === "greenfield"
          ? {
              strictTypes: strict,
              testFirst: testing,
              protectedPaths: lines(paths),
              customRules: lines(rules),
            }
          : {},
      );
      markdown = draft.markdown;
      sources = draft.attributions;
    } else if (!inspection && !inspecting)
      error =
        json.trim() && !repo.ok
          ? repo.error.message
          : "Inspect a GitHub repository, paste a package.json, or select a sample.";
  } catch (failure) {
    error =
      failure instanceof Error ? failure.message : "Check the configuration.";
  }
  const lint = lintMarkdown(markdown, { kind, profile });

  return (
    <>
      <header className="topbar">
        <div className="frame header-inner">
          <div className="brand">
            <span className="brand-mark">
              <Anvil size={24} />
            </span>
            SkillForge
          </div>
          <span className="workspace">
            <Laptop size={15} /> Local workspace
          </span>
        </div>
      </header>
      <main className="frame">
        <div className="intro">
          <h1>
            Instruction studio<span>.</span>
          </h1>
          <p>
            Build, audit, and export Markdown instructions for your coding
            agents.
          </p>
        </div>
        <nav className="artifact-tabs" aria-label="Artifact">
          <button aria-pressed={agents} onClick={() => setKind("agents")}>
            <FileCode2 /> AGENTS.md Builder
          </button>
          <button aria-pressed={!agents} onClick={() => setKind("skill")}>
            <Workflow /> SKILL.md Blueprint Studio
          </button>
        </nav>
        <div className="studio-grid">
          <section className="panel workbench">
            <div className="panel-title">
              <span className="icon-box">
                <SlidersHorizontal />
              </span>
              <h2>Configuration</h2>
            </div>
            {agents ? (
              <>
                <div className="field-group">
                  <h3>Input mode</h3>
                  <div className="mode-options">
                    {modes.map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        aria-pressed={mode === id}
                        onClick={() => setMode(id)}
                      >
                        <Icon size={17} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {mode === "greenfield" && (
                  <>
                    <div className="field-group">
                      <div className="row">
                        <h3>Technology stack</h3>
                        <small>{stack.length} selected</small>
                      </div>
                      <div className="chips">
                        {(Object.keys(technologyNames) as Technology[]).map(
                          (tool) => (
                            <button
                              key={tool}
                              aria-pressed={stack.includes(tool)}
                              onClick={() =>
                                setStack(
                                  stack.includes(tool)
                                    ? stack.filter((item) => item !== tool)
                                    : [...stack, tool],
                                )
                              }
                            >
                              {stack.includes(tool) ? <Check /> : <Plus />}
                              {technologyNames[tool]}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                    <div className="field-group">
                      <h3>Package manager</h3>
                      <div className="managers">
                        {(["npm", "pnpm", "yarn", "bun"] as const).map(
                          (item) => (
                            <button
                              key={item}
                              aria-pressed={manager === item}
                              onClick={() => setManager(item)}
                            >
                              {item}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                    <div className="field-group">
                      <h3>Engineering rules</h3>
                      <label className="switch-row">
                        <span>Strict TypeScript</span>
                        <input
                          type="checkbox"
                          disabled={!stack.includes("typescript")}
                          checked={strict && stack.includes("typescript")}
                          onChange={(e) => setStrict(e.target.checked)}
                        />
                      </label>
                      <label className="switch-row">
                        <span>Test-first workflow</span>
                        <input
                          type="checkbox"
                          checked={testing}
                          onChange={(e) => setTesting(e.target.checked)}
                        />
                      </label>
                    </div>
                    <div className="field-group">
                      <label>
                        Protected paths
                        <textarea
                          rows={2}
                          value={paths}
                          placeholder="One path per line"
                          onChange={(e) => setPaths(e.target.value)}
                        />
                      </label>
                      <label>
                        Custom rules
                        <textarea
                          rows={3}
                          value={rules}
                          placeholder="One instruction per line"
                          onChange={(e) => setRules(e.target.value)}
                        />
                      </label>
                    </div>
                  </>
                )}
                {mode === "repo" && (
                  <div className="field-group">
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (githubUrl.trim()) void inspectRepository(githubUrl);
                      }}
                    >
                      <label htmlFor="github-repository">
                        GitHub Repository URL
                      </label>
                      <div className="github-input-row">
                        <input
                          id="github-repository"
                          value={githubUrl}
                          onChange={(event) => setGithubUrl(event.target.value)}
                          placeholder="https://github.com/owner/repo"
                          autoComplete="off"
                          spellCheck={false}
                          disabled={inspecting}
                        />
                        <button
                          type="submit"
                          disabled={inspecting || !githubUrl.trim()}
                        >
                          <GitFork size={15} aria-hidden="true" />
                          {inspecting ? "Inspecting…" : "Inspect Repo"}
                        </button>
                      </div>
                      <details className="github-token">
                        <summary>GitHub token (optional)</summary>
                        <label>
                          Token for this request
                          <input
                            type="password"
                            ref={tokenInput}
                            autoComplete="off"
                            spellCheck={false}
                            disabled={inspecting}
                          />
                        </label>
                      </details>
                      <div
                        className="chips"
                        aria-label="Example GitHub repositories"
                      >
                        {githubExamples.map((example) => (
                          <button
                            type="button"
                            key={example}
                            disabled={inspecting}
                            onClick={() => void inspectRepository(example)}
                          >
                            {example}
                          </button>
                        ))}
                      </div>
                    </form>
                    {githubError && (
                      <p className="github-error" role="alert">
                        {githubError}
                      </p>
                    )}
                    {inspection && (
                      <div className="github-report">
                        <p>
                          <strong>
                            {inspection.repository.owner}/
                            {inspection.repository.repo}
                          </strong>
                          {inspection.profile && (
                            <span> · {inspection.profile.packageManager}</span>
                          )}
                        </p>
                        {inspection.packageNotice && (
                          <small>{inspection.packageNotice}</small>
                        )}
                        {inspection.agentFiles.length > 0 && (
                          <ul>
                            {inspection.agentFiles.map(({ name, markdown }) => (
                              <li key={name}>
                                <code>{name}</code>
                                {markdown === null ? (
                                  <small>Exceeds the 1 MiB import limit.</small>
                                ) : (
                                  <button
                                    type="button"
                                    aria-label={`Load existing file into Audit mode: ${name}`}
                                    onClick={() => {
                                      setAuditedFilename(name);
                                      setAgentsText(markdown);
                                      setMode("audit");
                                    }}
                                  >
                                    Load existing file into Audit mode
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {mode === "repo" && (
                  <div className="field-group">
                    <h3>Sample projects</h3>
                    <div className="chips">
                      {Object.entries(samples).map(([name, data]) => (
                        <button
                          key={name}
                          disabled={inspecting}
                          onClick={() =>
                            setManualManifest(JSON.stringify(data, null, 2))
                          }
                        >
                          <Blocks />
                          {name}
                        </button>
                      ))}
                    </div>
                    <label>
                      package.json
                      <textarea
                        rows={16}
                        value={json}
                        spellCheck={false}
                        onChange={(e) => setManualManifest(e.target.value)}
                        disabled={inspecting}
                        placeholder="Paste your package.json…"
                      />
                    </label>
                  </div>
                )}
                {mode === "audit" && (
                  <div className="field-group">
                    <label>
                      Existing {auditedFilename}
                      <textarea
                        rows={19}
                        value={agentsText}
                        placeholder="Paste Markdown to audit…"
                        onChange={(e) => setAgentsText(e.target.value)}
                      />
                    </label>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="field-group">
                  <label className="switch-row">
                    <span>Audit existing SKILL.md</span>
                    <input
                      type="checkbox"
                      checked={auditSkill}
                      onChange={(e) => setAuditSkill(e.target.checked)}
                    />
                  </label>
                </div>
                {auditSkill ? (
                  <div className="field-group">
                    <label>
                      Existing SKILL.md
                      <textarea
                        rows={18}
                        value={skillText}
                        onChange={(e) => setSkillText(e.target.value)}
                        placeholder="Paste the complete skill, including frontmatter…"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="field-group">
                    <label>
                      Blueprint
                      <select
                        value={skill.id}
                        onChange={(e) =>
                          setSkill(
                            blueprintFields(e.target.value as SkillBlueprintId),
                          )
                        }
                      >
                        {Object.values(skillBlueprints).map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Skill name
                      <input
                        value={skill.name}
                        onChange={(e) =>
                          setSkill({ ...skill, name: e.target.value })
                        }
                      />
                    </label>
                    {(["description", "workflow", "guardrails"] as const).map(
                      (key) => (
                        <label key={key}>
                          {
                            {
                              description: "Trigger description",
                              workflow: "Workflow steps · one per line",
                              guardrails: "Guardrails · one per line",
                            }[key]
                          }
                          <textarea
                            rows={key === "workflow" ? 8 : 4}
                            value={skill[key]}
                            onChange={(e) =>
                              setSkill({ ...skill, [key]: e.target.value })
                            }
                          />
                        </label>
                      ),
                    )}
                  </div>
                )}
              </>
            )}
            {error && (
              <p className="field-error" role="status">
                {error}
              </p>
            )}
          </section>
          <OutputPane
            markdown={markdown}
            lint={lint}
            agents={agents}
            sources={sources}
            audit={audit}
          />
        </div>
        <footer>
          <span>
            <CodeXml size={15} /> SkillForge
          </span>
          <span>
            <Layers3 size={14} /> Markdown studio
          </span>
        </footer>
      </main>
    </>
  );
}
