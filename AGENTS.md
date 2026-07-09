# AGENTS.md

## Project Vision

Build a Git-based fitness tracker running entirely on GitHub Pages.

## Core Principles

1.  Git is the database.
2.  Never hardcode workout data.
3.  Read data from `_data/*.yml`.
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
