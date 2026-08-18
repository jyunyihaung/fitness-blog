# AGENTS.md

## Project Vision

Build a Google Sheets-backed fitness tracker running entirely on GitHub Pages.

## Core Principles

1.  Google Sheets is the workout database; Git stores application source.
2.  Never hardcode workout data.
3.  Read workout data from the configured Google Sheet by column header.
4.  Keep modules independent.
5.  Write maintainable code.

## Architecture Layers

Presentation → Business Logic → Data

## Coding Rules

-   Semantic HTML
-   CSS Variables
-   ES6 Modules
-   No jQuery
-   No Bootstrap
-   Small reusable functions

## Repository Rules

-   `/assets` for static resources
-   `/_data` for YAML
-   `/_layouts` for layouts
-   `/_includes` for reusable components

## Statistics

Always generate statistics from workout data.

## Charts

Always use Chart.js.

## Git

Never modify GitHub Actions unless requested. Never break backward
compatibility.
