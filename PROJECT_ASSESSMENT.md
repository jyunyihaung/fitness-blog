# Repository Assessment

## Current state

The repository is a working Jekyll/GitHub Pages fitness tracker backed by Google
Sheets. The current client is a functional JavaScript MVP while the documented
Vite/TypeScript replacement remains a future migration.

Implemented capabilities include:

- A single app shell with hash routes for Dashboard, Add Record, Quick Add,
  Records, Goals, and Settings.
- Google Identity Services authorization with memory-only access tokens and
  Google Picker spreadsheet selection.
- Creation and named-header validation of the six version 1 workbook sheets.
- Non-destructive, user-confirmed repair of missing version 1 sheets, headers,
  settings, schema identity rows, and default exercises.
- Reading, creating, editing, and deleting Sessions/Sets records.
- Reading, creating, updating, and deleting Goals.
- Settings connection controls and workbook-backed preferences.
- Exercise master-data search, suggestions, add/edit, activation controls,
  normalized-name deduplication, and post-workout usage synchronization.
- Browser-generated statistics, estimated 1RM, goal progress, and Chart.js
  charts.
- Vitest coverage for pure domain functions and Google Sheets request builders.

The selected spreadsheet ID and display name are the only connection values
stored in `localStorage`. Access tokens and workout records remain memory-only.

## Remaining target-architecture gaps

| Area | Current | Target |
| --- | --- | --- |
| Runtime | Jekyll and ES modules | Vite and strict TypeScript |
| Quality tools | Vitest | Vitest, ESLint, typed build, integration tests |
| Repository | Google Sheets functions | Typed repository contract plus in-memory implementation |
| Errors | Stable safe client errors for external services | Typed errors throughout every layer |
| Exercises | Managed master data with normalized-name deduplication | Typed repository and broader conflict-recovery tests |
| UI assurance | Responsive components and route focus | Full accessibility, keyboard, privacy, and mobile audit |

## Current risks

- Browser-only OAuth depends on correctly restricted public client identifiers,
  API keys, production origins, and consent-screen configuration.
- Google Sheets has no relational transaction. Batch requests reduce partial
  writes, but application-level recovery remains important.
- Schema repair is deliberately additive. It cannot automatically correct
  renamed columns, incompatible app identities, unsupported versions, or
  destructive data problems.
- Automated tests require Node.js 20 or newer. Production verification should
  run both Vitest and a Jekyll build in a clean environment.
- Project Pages base paths remain a compatibility constraint during any Vite
  migration.

## Assessment conclusion

The Jekyll implementation is now a usable MVP rather than an initial prototype.
The next gate should focus on broader automated testing, exercise deduplication,
accessibility/error-state review, and a clean production verification. Vite and
TypeScript migration should begin only after the current deployable client
passes that gate. GitHub Actions remain unchanged unless explicitly requested.
