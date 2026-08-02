# Repository Guidelines

## Project Structure & Module Organization

This TypeScript/Mastra project turns a product brief into a marketing strategy and, optionally, a vetted social-content calendar. Source lives in `src/`:

- `agents/` contains agent factories and their `run*` helpers; content agents are grouped under `agents/content/`, and `agents/image-generation/` exposes the shared visual-generation agent.
- `workflows/marketing/` creates the strategy; `workflows/content/` turns its campaign plan into posts, generated visual specifications, hashtags, a calendar, and a claim audit; `workflows/image-generation/` also exposes visual generation as a standalone workflow.
- `schemas/` defines shared Zod input/output contracts; update these before changing workflow data shapes.
- `prompts/` holds agent instructions; `tools/` contains typed, read-only integrations; `lib/` contains generation, safety, scoring, and error helpers.
- `tests/agents/`, `tests/tools/`, and `tests/lib/` contain focused tests; `tests/integration/` covers workflows. Reuse `tests/helpers/` fixtures and mocks.

## Build, Test, and Development Commands

Use Node.js 22.18 or newer and install dependencies with `npm install`.

- `INDUSTRY=Software BUSINESS_TYPE=SaaS npm run dev -- "<product description>"` runs the strategy CLI and writes JSON to stdout.
- `npm run dev -- --content --platforms linkedin --duration "2 weeks" "<product description>"` also runs content creation.
- `npm run studio` launches the Mastra development studio.
- `npm run typecheck` performs strict TypeScript checking without emitting files.
- `npm run build` compiles the production output to `dist/`.
- `npm test` runs the Vitest suite once; `npm run test:watch` keeps it running during development.

Copy `.env.example` to `.env` and provide required provider keys before real runs. Never commit `.env`, API keys, or production `BRAND_CONTEXT_JSON` data.

## Coding Style & Naming Conventions

Write strict ES-module TypeScript with two-space indentation, semicolons, and single quotes. Use camelCase for values, PascalCase for types/Zod schemas, and kebab-case folders such as `buyer-persona/`. Keep an agent's factory and runner in `agent.ts` with `index.ts` re-exports. Use explicit Zod boundaries; keep tool inputs and outputs bounded, typed, and side-effect free unless approval is required.

## Testing Guidelines

Use Vitest (`*.test.ts`). Mock agents and external tools; tests must not call model or search providers. Add coverage whenever schemas, tool behavior, workflow ordering, retries, QA, approval, or claim safety changes. Run `npm run typecheck`, `npm test`, and `npm run build` before a pull request.

## Commit & Pull Request Guidelines

Follow the concise, imperative Conventional Commit style used in history, for example `feat: add structured error handling` or `fix: validate campaign output`. Keep commits focused. Pull requests should describe affected workflows, schemas, tools, and safety behavior; link issues where available; and include validation results. Include sample JSON or screenshots for CLI or Studio changes.
