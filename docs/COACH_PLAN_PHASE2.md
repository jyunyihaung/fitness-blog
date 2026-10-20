# Phase 2 — Training Plan Manager UI

## Scope
The new /#/training-plan route lets users browse multiple plans, inspect each
Week/Day, add a blank plan, import an existing Phase 0 local JSON file, change
plan metadata, edit workout title/date/status/notes, and create/update/delete
exercise prescriptions. The code uses the Phase 1 Google Sheets API to persist
changes, and does not create completed Sessions or Sets.

## Validation steps (use a COPY of the workout Google Sheet)

1. Make a backup of the selected Google Sheet in Google Drive. Choose that
   duplicate in Fitness Blog; do not perform first-run tests on the production
   training log.
2. On the Settings route, click **啟用訓練計畫資料表** and confirm. Verify
   that TrainingPlans, PlannedWorkouts, PlannedSets were added, along with
   a Schema key training_plan_schema_version with value 1.
3. Click **訓練課表** in the top navigation and **重新整理**. The list should
   be empty, not an error, before adding a plan.
4. Create a blank **4-week / 3-day** plan. Check 12 PlannedWorkouts rows,
   1 TrainingPlans row, 0 PlannedSets rows. Every workout has status
   not_provided.
5. Choose Week 1 Day 1 and edit its status to 已有訓練內容. Save; now add
   a Pause Squat, 2 sets, 4 fixed reps, load RPE 5. Save and refresh:
   the exercise still appears with the same prescription.
6. Add an activity named Walk, target 8500 steps. Change the order of the
   exercises without collisions. Edit then delete that activity and verify
   the original workout prescription remains unchanged.
7. Edit the plan's title/status/notes and the workout's date. Reload the
   entire browser page and reconnect Google to verify persistence.
8. On your own computer (not in public GitHub), use Phase 0 script to
   generate a JSON file and import it. The importer must show Week 1 and
   leave unprovided Weeks 2–4 blank. Values marked needs_review must be
   displayed as such, **not** guessed from Excel date coercions.
9. Repeat the Settings enabling action to verify idempotency. Check no
   duplicate tabs, no duplicate Schema version marker, and intact custom
   columns. Verify historical workout CRUD, Quick Add, and Goals still work.
10. Verify the site on a narrow mobile viewport and a desktop viewport.

### Acceptance boundary
The system can import and browse a plan **after** local JSON normalization;
it does not upload raw XLSX in the browser and does not automatically connect
an imported planned workout to a performed Session. Training execution, timer
and actual-versus-planned reconciliation are Phase 3 features.

### GitHub CI
Run npm run verify. The standard Release Gate runs lint, Vitest, production
Jekyll build and Playwright desktop/mobile tests. The Phase 1+2 persistence
tests use a mocked Google Sheets API: Google OAuth and a user-approved *backup*
Sheet still require the manual steps above.

### Privacy and recovery
Never publish the private workbook, imported JSON, athlete history, OAuth
tokens, or a linked backup sheet's identifier in a public issue/PR.
If the test fails after partial migration, stop and use the backed-up copy.
The Settings enable action is additive; it does not delete old rows.
