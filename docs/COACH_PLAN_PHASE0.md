# Coach Training Plan — Phase 0 (Data Normalization)

## Scope

This phase reads the **Block1** worksheet from a locally stored coach XLSX file and
produces **reviewable JSON**. It does **not** upload a workbook, modify the six
existing Google Sheets tabs, create actual training records, or change the UI.
Raw training data stays on the user's computer.

This is groundwork for Phase 1 (TrainingPlans / PlannedWorkouts / PlannedSets),
Phase 2 (UI), and Phase 3 (workout execution). It is separate from the existing
single-workout FITNESS-WORKOUT:1 share-code format.

## Run locally (Node.js 20+ and Python 3.9+)

Download the private workbook to the Git-ignored local-coach-plans folder.

~~~sh
node scripts/normalize-coach-plan.mjs "local-coach-plans/coach.xlsx"
~~~

Output: local-coach-plans/normalized-coach-plan.json, also Git-ignored.
Choose a custom output location by passing a second path argument.

Both readers use only Node.js and Python standard libraries. No extra npm
packages, OAuth, Google API calls, upload or workbook modification occurs.
Do **not** store real workbook content in assets, _data, docs, or tests.

## JSON data contract (v1)

- format = fitness-blog-coach-plan; version = 1
- source: Block1 worksheet name and an import timestamp, no student identity
- blocks[].weeks[]: week number, planned/not_provided state, workouts and notes
- workouts[]: day number, status, ordered items
- items[]: name, kind, planned, actual, coachNotes, source coordinates
- issues[]: ambiguities with review code, original content and cell address
- summary: number of weeks, days, populated workouts and review issues

Planned load is a tagged union and must never be silently converted to a
number: fixed kg, rpe_target, bodyweight, bounded lbs/kg, unspecified,
needs_review. Planned repetitions are fixed, range, until_rpe, unspecified,
or needs_review. Actual slash-separated weights become per_set valuesKg.
Actual firstRpe and lastRpe are distinct from planned RPE.

Never auto-fill missing reps as 1, convert bodyweight to 0 kg, or estimate a
prescribed RPE load just to satisfy the existing workout editor. Phase 3 must
perform an explicit reviewed mapping to actually performed sets.

## Known limitations

1. Only Block1 is normalized. Personal information, injury notes, PR/RPE
   reference tables, and variation percentage tabs are **not exported**.
2. Weeks with only labels and no work prescriptions remain not_provided.
3. Excel date-formatted exercise fields may have originated from a rep range.
   It is unsafe to guess: date_formatted_reps or date_formatted_load issues
   require manual verification.
4. Currently the first column contains DayN and exercise names, and each
   WeekN is an 8-column prescription group: sets, reps, prescribed load,
   actual load, first RPE, last RPE, record, coach notes.
5. Rest-day goals are preserved as notes; they are not scheduled activities.
6. Slash-separated actual weights are treated as kg as indicated by the coach
   workbook's execution-weight column. This tool does not convert units.
7. The actual Excel workbook should be locally checked after normalization
   before any plan becomes available for execution.

## Tests and release gate

~~~sh
npm test -- --run tests/coach-plan-normalize.test.js
npm run verify
~~~

Vitest uses synthetic, non-identifying fixtures. The existing PR Release Gate
runs lint, unit tests, build and Playwright. This phase does not alter CI files.

## Acceptance checklist

- [x] Local XLSX Block1 extraction without uploading athlete data
- [x] Keep Week / Day / exercise order and preserve blank weeks
- [x] Represent BW, target RPE, repetition ranges, activities and notes
- [x] Distinguish planned prescriptions from actual performance
- [x] Flag date-coerced cells rather than inventing values
- [x] Add synthetic unit tests
- [ ] Verify full private workbook locally against the extracted issues
- [ ] Confirm Release Gate V2 succeeds on the PR
