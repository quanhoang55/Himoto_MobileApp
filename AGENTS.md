# Repository Guidelines

## Project Structure & Module Organization

The application repository is in `Himoto/`. It is a Next.js 15 App Router project using React 19 and TypeScript. Route pages and handlers live in `Himoto/src/app/`; reusable UI is in `src/components/`; server-side workflows and shared utilities are in `src/lib/`; fixtures and type definitions are in `src/fixtures/` and `src/types/`. Static assets are in `public/`, operational and product notes are in `docs/`, and focused validation scripts are in `scripts/`.

## Build, Test, and Development Commands

Run commands from `Himoto/` and install dependencies with `npm ci` (or `npm install` when updating dependencies).

- `npm run dev` starts the local app at `http://127.0.0.1:3000`.
- `npm run build` creates a production build; `npm run start` serves it.
- `npm run typecheck` runs TypeScript without emitting files.
- `npm run lint` checks `src/` with ESLint; `npm run lint:management` targets management UI and related modules.
- `npm run test:contracts`, `npm run test:management`, or another `test:*` script runs the corresponding focused check in `scripts/`.

Set up `.env.local` from `.env.example` for server-side Supabase access when running the application. Do not commit secrets.

## Coding Style & Naming Conventions

Follow the existing TypeScript, React, and ESLint patterns. Use two spaces for indentation, `PascalCase` for React components and types, and `camelCase` for functions and variables. Keep server-only database and integration code under `src/lib/server/`; use descriptive kebab-case names for route folders and focused scripts such as `check-contract-billing.cjs`. Prefer small, domain-specific modules over duplicating workflow logic.

## Testing Guidelines

There is no single test runner command; checks are Node scripts named `scripts/check-*.cjs` and are exposed as `npm run test:*` package scripts. Run the check matching the affected feature, then run `npm run typecheck` and `npm run lint` for broader changes. Use the repository's existing fixtures and test conventions; do not treat fixtures as application data sources.

## Commit & Pull Request Guidelines

Recent commits use short imperative subjects with conventional prefixes, for example `fix(contracts): ...`, `feat: ...`, and `fix(operations): ...`. Keep changes focused and describe the user-visible behavior or bug in the subject. Pull requests should summarize the change, note relevant validation commands and results, link related issues when available, and include screenshots for UI changes.
