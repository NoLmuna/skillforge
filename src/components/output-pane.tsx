import { useEffect, useRef, useState } from "react";
import {
  Activity,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderOutput,
  GitBranch,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import type { RuleAttribution } from "../corpus/rules";
import type { LintResult } from "../lib/linter";

const targets = {
  codex: ["Codex CLI (.codex/)", ".codex"],
  universal: ["Universal (.agents/)", ".agents"],
  cursor: ["Cursor (.cursor/)", ".cursor"],
  claude: ["Claude Code (.claude/)", ".claude"],
  antigravity: ["Antigravity CLI", ".agents"],
} as const;

interface OutputProps {
  markdown: string;
  agents: boolean;
  audit: boolean;
  sources: readonly RuleAttribution[];
  lint: LintResult;
}

export default function OutputPane({
  markdown,
  agents,
  audit,
  sources,
  lint,
}: OutputProps) {
  const [target, setTarget] = useState<keyof typeof targets>("codex");
  const [copyState, setCopyState] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const filename = agents
    ? target === "claude"
      ? "CLAUDE.md"
      : "AGENTS.md"
    : "SKILL.md";
  const path = agents
    ? "./" + filename
    : lint.skillName
      ? `${targets[target][1]}/skills/${lint.skillName}/SKILL.md`
      : "";
  const { metrics, diagnostics } = lint;
  const list = markdown.replace(/\r?\n$/, "").split(/\r\n|\r|\n/);
  const tint = metrics.budgetStatus;
  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopyState("Copied!");
    } catch {
      setCopyState("Select the preview to copy manually.");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopyState(""), 2200);
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="output-column">
      <section className="panel health">
        <div className="row">
          <h2>
            <Activity /> Artifact health
          </h2>
          <span className={`badge ${tint}`}>
            <i />
            {metrics.budgetStatus}
          </span>
        </div>
        <div className="metrics">
          {[
            [metrics.lineCount, "Lines"],
            [metrics.characterCount, "Characters"],
            [metrics.estimatedTokens, "Est. tokens"],
          ].map(([value, label]) => (
            <div key={label}>
              <strong>{value.toLocaleString("en-US")}</strong>
              <small>{label}</small>
            </div>
          ))}
        </div>
        <div
          className={`meter ${tint}`}
          title={metrics.estimatedTokens + " estimated tokens"}
        >
          <span
            style={{ width: Math.min(100, metrics.estimatedTokens / 18) + "%" }}
          />
        </div>
      </section>
      <section className="panel preview">
        <div className="panel-title">
          <span className="icon-box">
            <Terminal />
          </span>
          <h2>Live preview</h2>
          <span className="live">
            <i /> Live
          </span>
        </div>
        <div className="editor">
          <div className="editor-tab">
            <FileText size={15} />
            {agents ? "AGENTS.md" : "SKILL.md"}
            <span>Markdown</span>
          </div>
          <div className="code" tabIndex={0} aria-label="Markdown preview">
            {markdown ? (
              list.map((line, index) => (
                <div className="code-row" key={index}>
                  <span aria-hidden="true" className="num">
                    {index + 1}
                  </span>
                  <code className={line.startsWith("#") ? "heading" : ""}>
                    {line.split(/(`[^`]*`)/g).map((part, i) => (
                      <span
                        className={part.startsWith("`") ? "literal" : undefined}
                        key={i}
                      >
                        {part}
                      </span>
                    ))}
                    {line === "" && " "}
                  </code>
                </div>
              ))
            ) : (
              <p className="empty-preview">
                Your Markdown preview will appear here.
              </p>
            )}
          </div>
        </div>
        <div className="actions">
          <button disabled={!markdown} onClick={copy}>
            {copyState === "Copied!" ? <Check /> : <Copy />}
            {copyState === "Copied!" ? copyState : "Copy Markdown"}
          </button>
          <button disabled={!markdown} onClick={download} className="primary">
            <Download /> Download File
          </button>
        </div>
        {copyState && copyState !== "Copied!" && (
          <p role="status">{copyState}</p>
        )}
      </section>
      <details
        className="panel disclosure"
        open={diagnostics.length > 0 || undefined}
      >
        <summary>
          <ShieldCheck />
          <h2>Diagnostics</h2>
          <small>{diagnostics.length}</small>
          <ChevronDown />
        </summary>
        {diagnostics.length ? (
          <ul>
            {diagnostics.map((d, i) => (
              <li key={i}>
                <b>
                  {d.severity}
                  {d.line ? " · Line " + d.line : ""}
                </b>
                <p>{d.message}</p>
                <small>{d.suggestion}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="info">
            <CheckCircle2 size={16} />
            {markdown ? "No issues found." : "Awaiting Markdown input."}
          </p>
        )}
      </details>
      <section className="panel export">
        <h2>
          <FolderOutput /> Export destination
        </h2>
        <label>
          Agent target
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as keyof typeof targets)}
          >
            {Object.entries(targets).map(([id, [label]]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <code>
          {path || "Enter a valid skill name to see its destination."}
        </code>
      </section>
      <details className="panel disclosure">
        <summary>
          <BookOpen />
          <h2>Reference provenance</h2>
          <small>{sources.length}</small>
          <ChevronDown />
        </summary>
        {sources.length ? (
          <ul>
            {sources.map((s) => (
              <li key={s.id}>
                <a
                  href={
                    s.sourceUrl.startsWith("https://github.com/")
                      ? s.sourceUrl
                      : "https://github.com/" + s.sourceRepo
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  <GitBranch size={14} />
                  {s.sourceRepo}
                  <ExternalLink size={13} />
                </a>
                <p>{s.rationale}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="info">
            {audit
              ? "Pasted Markdown has no generator attribution."
              : "Generate a draft to see its sources."}
          </p>
        )}
      </details>
    </div>
  );
}
