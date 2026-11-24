# AGENTS.md

## Commands
- Install dependencies: `npm install`
- Dev server: `npm run dev`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Unit tests: `npm test`
- Production build: `npm run build`

## Stack & Coding Standards
- Framework: Next.js (App Router) with strict TypeScript (`strict: true`) and Tailwind CSS.
- Avoid `any`; define explicit interfaces for all corpus rules, profiles, and linter diagnostics.
- Keep core parsing, generation, and linting logic in pure, framework-agnostic TypeScript modules so they can be unit tested in Node without browser dependencies.
- Write Vitest unit tests in `tests/` for every new parser, generator rule, or validator.

## Boundaries
- Never read, modify, or expose `.env*` files.
- Do not add directory layouts or folder trees to generated `AGENTS.md` outputs.

## Done Criteria
- Never finish a task until `npm run typecheck`, `npm run lint`, and `npm test` all pass with zero errors.