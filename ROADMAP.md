# Roadmap

## Phase 1 — Repository assessment (complete)

- Inventory the Jekyll site, data path, modules, styles, and deployment files.
- Identify reusable UI/statistics work and migration gaps.
- Record requirement conflicts, risks, and compatibility strategy.

Deliverable: `PROJECT_ASSESSMENT.md`.

## Phase 2 — Architecture and data model (complete)

- Define client-only layers and dependency direction.
- Define named-header Sheets schema and migration rules.
- Define repository boundary, OAuth flow, state, errors, and security rules.
- Document the incremental migration strategy.

Deliverables: `ARCHITECTURE.md`, `DATA_MODEL.md`, and this milestone plan.

## Phase 3 — Project foundation

- Add Vite, strict TypeScript, ESLint, Vitest, and `.env.example`.
- Add hash router, app shell, responsive navigation, style tokens, and accessible
  loading/error/empty components.
- Add typed models, repository interfaces, sanitized application errors, and an
  in-memory repository.
- Revise `AGENTS.md` and README to match the approved runtime/data architecture.
- Verify lint, unit tests, and production build without changing Actions.

## Phase 4 — Google integration

- Add GIS token service with memory-only tokens and expiry handling.
- Add typed Drive and Sheets clients.
- Discover compatible spreadsheets, parse pasted URLs, and create workbooks.
- Validate and non-destructively repair version 1 schemas.
- Implement the Google Sheets repository and Settings connection UI.

## Phase 5 — Domain logic

- Implement validation, volume, estimated 1RM, goal progress, grouping, exercise
  deduplication, and date sorting as pure functions.
- Cover edge cases and repository behavior with unit tests.

## Phase 6 — MVP pages

- Welcome/setup flow.
- Dashboard goal cards, latest workout, trend, and empty state.
- Add Record nested exercise/set editor, preview, validation, and safe save.
- Record List grouped sessions, expansion, detail, and delete confirmation.
- Settings spreadsheet controls, goals, and preferences.

## Phase 7 — Review and deployment

- Run lint, tests, and production build.
- Audit accessibility, mobile keyboard behavior, privacy, error states, and base
  path handling.
- Update README with Google Cloud and Pages setup.
- Add or change GitHub Actions only with explicit authorization.

## Expected file changes

```text
package.json, package-lock.json, tsconfig.json, vite.config.ts
eslint.config.js, index.html, .env.example, .gitignore
src/app/*, src/auth/*, src/google/*, src/repositories/*
src/domain/**/*, src/services/*, src/pages/**/*, src/components/**/*
src/storage/*, src/styles/*, src/utils/*, tests/**/*
README.md, AGENTS.md, ARCHITECTURE.md, DATA_MODEL.md, ROADMAP.md
```

The legacy Jekyll files remain until the replacement passes the Phase 3 gate.
