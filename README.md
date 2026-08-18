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
  spreadsheet_id: "SPREADSHEET_ID"
```

The dashboard fetches both sheets at runtime, joins rows using `session_id`, and
generates all statistics in the browser. Do not commit API keys or credentials.

## Future

* Nutrition
* Sleep
* Garmin
* Apple Health
* AI Coach
