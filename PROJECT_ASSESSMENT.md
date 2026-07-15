# Repository Assessment

## Current state

- The site is a working Jekyll/GitHub Pages dashboard.
- Workout data is rendered from `_data/workouts.yml`.
- Statistics are browser-side ES modules and Chart.js is loaded from a CDN.
- The working tree was clean at assessment time.
- There is no TypeScript, package manifest, test runner, OAuth integration,
  repository abstraction, form workflow, or Google API client.
- No GitHub Actions workflow is present in the checked-out tree.

## Reusable assets

- Semantic layout, skip link, responsive CSS variables, cards, empty states, and
  Chart.js rendering patterns can inform the replacement UI.
- Existing pure-ish statistics code supplies baseline behavior, but its YAML
  workout shape differs from the target Sessions/Sets model.
- The current GitHub Pages site is a useful compatibility baseline until the SPA
  reaches feature parity.

## Gaps against the MVP

| Area | Current | Required |
| --- | --- | --- |
| Runtime | Jekyll-rendered page | Vite TypeScript client SPA |
| Data | Git/YAML | Google Sheets repository |
| Auth | None | Google Identity Services OAuth |
| Navigation | Anchors | Dashboard, Add Record, Records, Settings |
| Domain | Aggregate YAML stats | Sessions/Sets validation and pure statistics |
| Testing | None | Unit, repository, and core UI tests |
| Deployment | Jekyll-compatible | Tested Vite build with Project Pages base |

## Conflicts and decisions

`AGENTS.md` currently says Git is the database and data must come from YAML. The
new product specification explicitly requires Google Sheets as the source of
truth and prohibits storing training data in Git. The product specification is
treated as the requested target; `AGENTS.md` should be revised in the foundation
phase at the same time the runtime changes, rather than silently ignored.

The existing rule not to modify GitHub Actions without a request remains active.
No workflow is changed during assessment or architecture work.

## Risks

- A browser-only OAuth flow cannot keep secrets; configuration must contain only
  public client identifiers and an API key restricted by origin/API.
- OAuth consent verification and production origins can block real-account tests.
- Sheets writes do not provide relational transactions; batch writes and clear
  partial-failure handling are required.
- Project Pages base paths break history routers and root-relative assets; use a
  hash router and Vite base configuration.
- Migrating in place can temporarily break the live site; keep the Jekyll build
  intact until the foundation phase passes tests and production build.

## Phase 1 conclusion

The repository is small and migration is feasible. The safest sequence is to
land target documentation and contracts first, add a parallel Vite foundation,
then replace the published entry point only after an in-memory vertical slice
and production build succeed.
