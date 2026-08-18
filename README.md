# Fitness Blog

A fitness tracking website powered by Google Sheets and GitHub Pages.

Google Sheets is the workout database. Git stores the application source and
deployment history.

## Features

* Workout Log
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

## Quick Start

``` shell

git clone

bundle install

bundle exec jekyll serve

```

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

## Future

* Nutrition
* Sleep
* Garmin
* Apple Health
* AI Coach
