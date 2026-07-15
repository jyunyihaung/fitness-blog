# Architecture

## Decision status

This document defines the target architecture for the Powerlifting Training
Tracker. The current Jekyll application remains deployable while the Vite and
TypeScript client is introduced incrementally.

The product specification supersedes the original "Git is the database"
assumption for training records. Google Sheets is the source of truth. Git
continues to hold application source, documentation, and deployment history.

## Constraints

- Static client application hosted by GitHub Pages.
- No server, OAuth proxy, Firebase, Supabase, or client secret.
- Google Identity Services obtains short-lived access tokens in memory.
- Google Drive and Google Sheets APIs are called only through application
  services and repositories.
- No access token, refresh token, password, or workout data is persisted in Git
  or browser storage.
- The selected spreadsheet ID, preferences, and an unsaved draft may be stored
  locally.
- Hash routing is used so GitHub Project Pages never needs an SPA fallback.

## Layers

```text
Pages and reusable components
          |
Application services and state
          |
Domain models, validation, statistics
          |
TrainingRepository interface
       /         \
Google Sheets   In-memory repository
          |
Google Drive and Sheets APIs
```

The UI never constructs API requests or interprets spreadsheet row positions.
The repository maps header names to columns, and the domain layer contains pure
functions with no DOM or Google API dependencies.

## Proposed modules

```text
src/
  app/                 bootstrap, hash router, state
  auth/                Google Identity Services and auth types
  google/              API client, Drive service, Sheets service, config
  repositories/        interface, Google Sheets and in-memory implementations
  domain/models/       session, training set, exercise, goal, settings
  domain/statistics/   volume, one-rep max, progress, grouping
  domain/validation/   input and record validation
  services/            setup, records, dashboard, schema migration
  pages/               welcome, dashboard, add, records, detail, settings
  components/          accessible reusable UI
  storage/             preferences and draft storage only
  styles/              tokens, base, layout, components, utilities
  utils/               dates, numbers, IDs, sanitized errors
```

## Application state

```text
authStatus
googleUser
accessTokenStatus
selectedSpreadsheet
spreadsheetSchemaStatus
sessions
sets
exercises
goals
loadingStatus
errorState
draftRecord
```

State is refreshed from Google Sheets after mutations. A token is held only in
memory and discarded on sign-out, expiry, or page reload.

## Repository contract

`TrainingRepository` is the boundary used by application services:

```ts
interface TrainingRepository {
  initializeSpreadsheet(title?: string): Promise<SelectedSpreadsheet>;
  validateSchema(spreadsheetId: string): Promise<SchemaReport>;
  repairSchema(spreadsheetId: string): Promise<SchemaReport>;
  listSessions(): Promise<TrainingSession[]>;
  getSessionById(sessionId: string): Promise<SessionDetail | null>;
  createSession(input: CreateSessionInput): Promise<SessionDetail>;
  deleteSession(sessionId: string): Promise<void>;
  listExercises(): Promise<Exercise[]>;
  upsertExercise(input: UpsertExerciseInput): Promise<Exercise>;
  getGoals(): Promise<Goal[]>;
  updateGoals(goals: Goal[]): Promise<Goal[]>;
}
```

`GoogleSheetsTrainingRepository` maps named headers and uses batch operations
where possible. `InMemoryTrainingRepository` supports unit and UI tests without
Google APIs.

## OAuth and spreadsheet selection

```text
Open app
  -> request a GIS access token after an explicit user action
  -> search Drive for Google Sheets files
  -> inspect candidate Schema sheets for the expected app_id
  -> choose a compatible file, paste a Sheets URL, or create a new file
  -> validate sheet names, headers, app_id, and schema_version
  -> repair missing sheets/headers only after confirmation
  -> load repository data
  -> open Dashboard
```

Scopes are requested at the narrowest practical level and explained before the
Google consent UI. A pasted URL is parsed to a spreadsheet ID and then validated;
it is never trusted solely because its format is valid.

## Writes and consistency

Creating a record generates all UUIDs and timestamps first. The repository then
uses a batch write for one Sessions row and all Sets rows. If a later exercise
history update fails, the record remains valid and the UI reports a recoverable
warning. The save button stays disabled while the request is pending to prevent
duplicate submissions.

Deleting a record finds rows by header and `session_id`, deletes Sets rows before
the Sessions row, and refreshes state. Partial failures are surfaced without
claiming success.

## Error and security model

External errors are converted to a sanitized application error containing a
stable code, user-safe message, retryability, and optional action. Raw API
responses and credentials are never rendered. User-controlled text is assigned
with text-safe DOM APIs, never interpolated through `innerHTML`.

## Deployment

Vite's `base` is set from the repository name for production and `/` locally.
The hash router owns application routes. The planned workflow installs locked
dependencies, runs lint and tests, builds, and deploys `dist/` to Pages. Per the
existing repository rule, workflow changes require a separately requested phase.
