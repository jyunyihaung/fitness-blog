# Architecture

## Decision status

This document defines the target architecture for the Powerlifting Training
Tracker. The current Jekyll application remains deployable while the Vite and
TypeScript client is introduced incrementally.

The current Jekyll client now uses a single app shell and hash router for
Dashboard, Add Record, Quick Add, and Goals. These routes share one memory-only
`GoogleAuthService` instance and application state. The later Vite/TypeScript
migration should preserve these runtime and security boundaries.

Quick Add is a draft producer in the business-logic layer. It resolves a
reference 1RM from Goals and workout history, applies a centralized training
mode prescription, and passes the resulting draft to the existing Add Record
editor. Validation, Sessions/Sets conversion, and Google Sheets writes remain a
single shared pipeline.

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

The current JavaScript implementation begins this boundary in `app-state.js`;
OAuth ownership is isolated in `auth-service.js`, routing in `router.js`, and
`app.js` is the single browser entry point.

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
  -> show the setup screen when no usable spreadsheet is selected
       -> [選擇 Google Sheet 檔案]
       -> [建立 Google Sheet 檔案]
  -> request a GIS access token only after either explicit button action
  -> select an existing file with Google Picker, or create a new workbook
  -> validate sheet names, headers, app_id, and schema_version
  -> repair missing sheets/headers only after confirmation
  -> load repository data
  -> open Dashboard
```

### Setup screen requirements

When the application has no selected spreadsheet, the stored spreadsheet ID no
longer exists, access has been revoked, or schema validation shows that the file
is incompatible, the application displays a setup screen instead of an empty
dashboard. The primary actions are visible without opening another menu:

- **選擇 Google Sheet 檔案** opens Google authorization from that user gesture,
  then launches Google Picker filtered to Google Sheets files. After selection,
  the app validates the workbook before storing its ID or opening the dashboard.
- **建立 Google Sheet 檔案** opens Google authorization from that user gesture,
  then creates a workbook named `Powerlifting Training Tracker`. The setup
  service creates `Sessions`, `Sets`, `Goals`, `Settings`, `Schema`, and
  `Exercises`, writes all version 1 headers and initial rows defined in
  `DATA_MODEL.md`, validates the result, stores its ID, and opens the dashboard.

Both actions have idle, authorizing, working, success, cancelled, and error
states. While an operation is pending, both buttons are disabled and the active
button communicates progress. Cancelling account selection or Picker returns to
the setup screen without showing an application error. Permission denial,
network failure, invalid schema, and a partially initialized workbook show a
safe, actionable message with retry and choose-another-file actions.

The app must not silently repair a selected existing workbook. It may retry or
complete initialization of a workbook that it just created, because that file
was created specifically for this app and contains no pre-existing user data.
The selected spreadsheet ID may be stored locally; access tokens must remain in
memory and must be discarded on sign-out, expiry, or page reload.

### OAuth implementation decision

The GitHub Pages client uses Google Identity Services (GIS) token model with
popup consent. Authorization is separate from application identity and begins
only from one of the setup buttons or a later reconnect action. The access token
is attached to direct Google REST API requests and is never written to Git,
`localStorage`, `sessionStorage`, cookies, logs, or rendered error messages.

Use the non-sensitive `https://www.googleapis.com/auth/drive.file` scope. It
permits this app to create files and work with files explicitly selected through
Google Picker without granting access to the user's entire Drive. Google Picker
is filtered to `application/vnd.google-apps.spreadsheet`. The Picker developer
key is public configuration restricted by HTTP referrer; the OAuth client ID is
also public configuration restricted to the production and local JavaScript
origins. No client secret is shipped to the browser.

The token client handles expiry explicitly. When a Google API call returns an
authorization failure, state changes to `token-expired` and a user-driven
Reconnect action requests a new access token before retrying. This static
deployment does not request or store refresh tokens. If future requirements add
background synchronization or access while the user is absent, the architecture
must change to a backend authorization-code flow with secure refresh-token
storage.

The Google Cloud project must enable Google Sheets API, Google Drive API, Google
Picker API, configure an OAuth consent screen, create a Web application OAuth
client, register exact JavaScript origins, and restrict the Picker API key by
origin and API. Production rollout must include consent-screen publication and
any verification required by the final scopes.

### Setup acceptance criteria

- A first-time user sees exactly the two setup actions before any dashboard data.
- Selecting a compatible workbook persists only its ID and loads its records.
- Selecting an incompatible workbook does not persist it and offers another
  selection without losing application state.
- Creating a workbook produces all six version 1 sheets, headers, schema identity,
  initial settings, and default exercises defined in `DATA_MODEL.md`.
- Refreshing the page reuses the selected spreadsheet ID but requires a new token
  before private data is accessed.
- No access token, refresh token, client secret, or workout record is present in
  browser persistence, generated site files, repository files, or logs.

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
