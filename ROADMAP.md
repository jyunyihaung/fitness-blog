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

Status: partially implemented in the Jekyll client. A hash router, single app
shell, shared memory-only OAuth service, app state, and accessible route focus
management are now present. Vitest and the first pure-module test suite are also
configured; Vite, TypeScript, and ESLint remain pending.

- Add Vite, strict TypeScript, ESLint, Vitest, and `.env.example`.
- Add hash router, app shell, responsive navigation, style tokens, and accessible
  loading/error/empty components.
- Add typed models, repository interfaces, sanitized application errors, and an
  in-memory repository.
- Revise `AGENTS.md` and README to match the approved runtime/data architecture.
- Verify lint, unit tests, and production build without changing Actions.

## Phase 4 — Google integration

Status: in progress. The Jekyll client now contains the initial GIS token,
Picker, workbook creation, validation, private read path, Settings connection
controls, and explicit additive schema repair. Typed clients, broader integration
tests, and production credential verification remain pending.

- Add GIS token service with memory-only tokens and expiry handling.
- Add typed Drive and Sheets clients.
- Add the first-run setup screen with **選擇 Google Sheet 檔案** and
  **建立 Google Sheet 檔案** as the two primary actions.
- Use Google Picker with `drive.file` scope to choose an existing Sheets file,
  validate it, and persist only its spreadsheet ID.
- Create a `Powerlifting Training Tracker` workbook with all six version 1
  sheets, headers, schema rows, settings, and default exercises.
- Validate and non-destructively repair version 1 schemas. (implemented in the
  current Jekyll client)
- Implement the Google Sheets repository and Settings connection UI. (Settings
  UI implemented; typed repository remains pending)

Phase 4 is complete only when cancellation, permission denial, token expiry,
invalid schema, network failure, and partial initialization have actionable UI
states and neither credentials nor workout records are persisted locally.

## Phase 5 — Domain logic

Status: in progress. Workout validation and conversion, named-header mapping,
statistics, Goals validation/progress, estimated 1RM, Exercise normalization and
deduplication, and Sheets request builders now have automated tests. Broader edge
cases and full repository behavior remain pending.

- Implement validation, volume, estimated 1RM, goal progress, grouping, exercise
  deduplication, and date sorting as pure functions.
- Cover edge cases and repository behavior with unit tests.

## Phase 6 — MVP pages

Status: in progress. The Jekyll client now includes the first mobile-friendly
Add Record form, validation, OAuth-on-save, and batched Sessions/Sets append;
Goals can now be loaded and updated for squat, bench press, and deadlift, with
progress and estimated 1RM cards on the Dashboard. Quick Add now generates an
editable Add Record draft from the three competition lifts, six centralized
training modes, and a resolved or manually entered reference 1RM. Its inline
editor shares the Add Record exercise/set component and saves only sets marked
completed through the existing Sessions/Sets pipeline. Record editing and
deletion are available from the record list for connected, writable
spreadsheets. Goal deletion and workbook-backed preferences are also available;
Add Record also supports versioned copy/paste coach workout codes with checksum
validation and an import preview. Quick Add can export its edited suggestion
without workout/set notes through the same format, with an explicit choice
between the current resolved maximum and a manually entered maximum. Typed
migration remains pending.

Settings now provides Exercise search, creation, editing, deactivation, and
reactivation. Add Record and Quick Add share active Exercise suggestions and
perform a best-effort master-list sync after workout persistence.

- Welcome/setup flow implementing the two-button requirements and acceptance
  criteria in `ARCHITECTURE.md`.
- Dashboard goal cards, latest workout, trend, and empty state.
- Add Record nested exercise/set editor, preview, validation, and safe save.
- Add Record coach-code export, copy/paste import, validation, and preview.
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
