# SkillForge

SkillForge builds and audits Markdown instructions for coding agents. Draft a project-wide `AGENTS.md` or a reusable `SKILL.md`, review live diagnostics, and export the Markdown for your agent.

<img width="1889" height="958" alt="SkillForge Instruction Studio split-pane interface" src="https://github.com/user-attachments/assets/006163c7-5696-4fe9-84e6-1cd1449b4537" />

## Studio

| Workflow | What it does |
| --- | --- |
| Greenfield builder | Select a stack and package manager, then set conventions, protected paths, and project rules. |
| Existing repo | Paste a `package.json` or inspect a public GitHub URL or `owner/repo`. SkillForge checks the default branch root for dependencies, scripts, and lockfiles. Open any detected `AGENTS.md`, `CLAUDE.md`, or `.cursorrules` in Audit mode. |
| Skill studio | Start with a feature planning, PR review, bug investigation, or migration blueprint. Edit its trigger and workflow before exporting. |
| Token and spec linter | Audit generated or pasted files for token overhead, instruction quality, script references, and skill frontmatter. |

The GitHub inspector works without a token. If you hit GitHub’s rate limit, supply an optional token for the inspection request. SkillForge forwards it to GitHub as a bearer credential and does not store or log it. The inspector reads regular files at the root and imports text files up to 1 MiB each. When multiple lockfiles exist, it prefers a matching package manager declaration and otherwise checks pnpm, Bun, Yarn, then npm.

## Reference corpus

- [agentskills/agentskills](https://github.com/agentskills/agentskills) defines the skill format and progressive disclosure conventions.
- [mattpocock/skills](https://github.com/mattpocock/skills) informs planning, debugging, and test-first workflows.
- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) informs production engineering, review, and migration guardrails.
- [anthropics/skills](https://github.com/anthropics/skills) informs skill authoring and trigger phrasing.
- [wshobson/agents](https://github.com/wshobson/agents) informs shared instructions and portability across agent tools.

## Local development

```sh
npm install
npm run dev
```

Open the studio at [localhost:3000](http://localhost:3000).

```sh
npm run typecheck
npm run lint
npm test
npm run build
```
