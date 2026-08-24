# Fitness Blog

A fitness tracking website powered by Google Sheets and GitHub Pages.

Google Sheets is the workout database. Git stores the application source and
deployment history.

## Features

* Workout Log
* Add workout records from desktop or mobile
* Copy and paste versioned coach workout codes into Add Record
* Generate editable workouts from a lift, training mode, and reference 1RM
* Squat, bench press, and deadlift goals
* Body Weight
* Personal Records
* Statistics
* Charts
* Git History
* GitHub Pages

## Technology

* Jekyll
* GitHub Pages
* Chart.js
* Google Sheets
* GitHub Actions

## Application routes

The GitHub Pages site uses a client-side hash router so Dashboard, Add Record,
Quick Add, Goals, and Settings share one in-memory Google OAuth session:

```text
/fitness-blog/#/dashboard
/fitness-blog/#/record/new
/fitness-blog/#/quick-add
/fitness-blog/#/goals
/fitness-blog/#/settings
```

The legacy `/record/` and `/goals/` URLs redirect to their hash routes. Access
tokens remain memory-only and are discarded when the tab reloads or closes.

## Quick Start

``` shell

git clone

bundle install

bundle exec jekyll serve

```

## Tests

The browser-independent domain and Google Sheets request builders are covered by
Vitest. Use Node.js 20 or newer:

```shell
npm install
npm test
```

The tests cover workout validation and record conversion, Quick Add prescriptions
and reference 1RM resolution, named-header workout mapping, statistics, Goals
parsing/validation/progress, and Sessions/Sets/Goals batch request construction.

## Folder Structure

* assets
* _layouts
* _includes
* .github

## Connect Google Sheets

1. Create the `Sessions` and `Sets` sheets using the headers in
   [`DATA_MODEL.md`](DATA_MODEL.md).
2. Share the spreadsheet as **Anyone with the link can view**.
3. Copy the ID from `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`.
4. Set it in `_config.yml`:

```yaml
google_sheets:
  spreadsheet_id: "" # Optional public, read-only fallback
  oauth_client_id: "YOUR_WEB_OAUTH_CLIENT_ID.apps.googleusercontent.com"
  picker_api_key: "YOUR_RESTRICTED_BROWSER_API_KEY"
  picker_app_id: "YOUR_GOOGLE_CLOUD_PROJECT_NUMBER"
```

For private spreadsheets, create a Google Cloud project and enable Google Sheets
API, Google Drive API, and Google Picker API. Configure the OAuth consent screen,
create a Web application OAuth client, and register the exact production and
local JavaScript origins. Restrict the browser API key by HTTP referrer and limit
it to Google Picker API.

For this GitHub Project Pages deployment, configure Google Cloud with:

```text
Authorized JavaScript origins
https://jyunyihaung.github.io
http://localhost:4000

Picker API key website restrictions
https://jyunyihaung.github.io/fitness-blog/*
http://localhost:4000/*
```

An OAuth JavaScript origin contains only the scheme and host, so do not append
`/fitness-blog/`. No authorized redirect URI or client secret is used: the
Jekyll site uses the Google Identity Services token model and popup callback.
After changing `_config.yml`, rebuild the site locally or push the change so
GitHub Pages can rebuild it.

The OAuth client ID, restricted browser API key, and project number are public
browser configuration, not secrets. Never add an OAuth client secret or access
token to this repository. Access tokens are kept in memory only.

When no public fallback is configured, the first-run screen lets the user select
an existing compatible spreadsheet or create a complete version 1 workbook. The
selected spreadsheet ID is saved locally; a fresh user gesture is required to
authorize private data after a page reload.

After connecting a spreadsheet, open **新增紀錄** to add a training session and
its exercise sets. The form validates values in the browser, requests a fresh
Google access token from the save action, and appends the Session and Sets in one
Sheets batch request. Tokens and workout form data are not persisted locally.

The Add Record page can export the current workout as a `FITNESS-WORKOUT:1`
text code or import a code pasted from a coach. Codes use UTF-8 Base64URL plus a
short SHA-256 checksum so truncated or modified messages are rejected. Importing
always opens a preview and replaces only the in-memory editor draft; the user
must review and press Save before anything is written to Google Sheets. A code
is not encrypted and should not contain sensitive personal information.

After Quick Add generates a suggestion, **匯出課表** exports every set currently
shown in its editable workout editor together with the selected mode's goal,
RPE guidance, rest interval, technique tips, and any divergence warning. Export
does not depend on the completed-set checkboxes; those checkboxes continue to
control only which sets are saved as a completed workout.

Quick Add provides an explicit reference-weight choice. **目前最大重量** resolves
the selected lift from Goals current weight, historical best single, then
historical estimated 1RM and therefore requires a connected Sheet. **手動輸入最大重量**
uses only the entered positive 0.5 kg increment and can generate or export a
suggestion without a Sheet connection; saving the completed workout still
requires one.

Open **訓練目標** to load and update squat, bench press, and deadlift goals. Goal
progress uses the explicitly stored current and target weights. The Dashboard
also shows an estimated 1RM calculated from recorded sets without overwriting
the stored current weight.

Open **設定** to update workbook-backed preferences, remove the locally saved
connection, or explicitly run an additive schema repair. Repair may create
missing version 1 sheets, append missing headers, and initialize empty Settings,
Schema, or Exercises data. It never removes, renames, reorders, or overwrites
existing user columns and records.

## Future

* Nutrition
* Sleep
* Garmin
* Apple Health
* AI Coach

## License

This project is licensed under the [MIT License](LICENSE).
