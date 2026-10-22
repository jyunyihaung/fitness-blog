# Phase 3 — Training Plan → Completed Workout

## What this phase adds

1. Open **訓練課表** → select an existing non-archived plan, Week and Day.
2. Click **開始本日訓練**. A separate execution panel opens using the same
   nested exercise/set editor as **新增紀錄** and **快速新增**.
3. Each set displays the original **coach target** above editable actual
   weight (kg), repetitions, RPE, warm-up flag, set type and notes.
4. Checking **完成** starts the existing inline rest timer automatically,
   except after the final set of an exercise. Warm-up sets default to 90s,
   working sets to 120s, with existing pause/adjust/reset buttons.
5. On **儲存已完成組數**, only checked and valid sets are saved to the
   original `Sessions` and `Sets` tables, with extra plan linkage.
6. On success the UI returns to **紀錄列表**. Failed saves retain the
   execution form and stable session ID so the user can retry safely.

### Plan targets are NOT actual data

- Fixed **kg** and fixed repetitions may initialize the editable fields,
  but these are **not completed** until the user explicitly checks the set.
- RPE targets are not actual RPE. Actual RPE is blank until entered.
- BW, fixed lbs, ranges, "until RPE", ambiguous Excel dates, and unspecified
  targets must be entered/confirmed manually for completed sets.
- Steps and other `activity` goals are listed as excluded and do not become
  fake weight-training records.
- Extra manually added sets/exercises have an empty `planned_set_id`.

### Schema changes

There are no new required legacy fields. The optional named columns are:

```
Sessions: plan_id, planned_workout_id
Sets: planned_set_id
```

New workbooks include these. Existing user workbooks need a *user-confirmed*
visit to **設定 → 啟用訓練計畫資料表**, which safely adds missing
columns without editing historical rows.

A linked session has its own `session_id` created when execution starts.
If a save might have succeeded but its HTTP response was lost, retrying uses
the **same** ID and first checks the existing Sessions list. It does not
append a duplicate in that ordinary retry scenario. This does not provide
a global concurrency lock across simultaneous devices.

PlannedRows ↔ actual rows remain independent. Deleting an old training plan
is not part of this phase. Existing workout history and unlinked Quick Add
and Add Record remain compatible.

### Test plan (prefer a backup Google Sheet)

1. Copy the training Google Sheet and select that **backup** in the app.
2. Open Settings and explicitly activate/repair Training Plan columns.
3. Open a Week/Day with Squat 2+ sets, e.g. fixed kg and RPE-based targets.
4. Click Start Workout. Confirm plan targets are visible and actual RPE is
   empty, while BW and uncertain weights do not become invented 0 kg data.
5. Fill **one** set and check it complete; ensure inline 90/120 second rest
   timer starts and pause/reset/adjust are usable.
6. Leave another set unchecked, press Save, and verify exactly one new
   Sessions record and one Sets record.
7. Check the session's `plan_id` and `planned_workout_id`, and that
   completed set's `planned_set_id` points to the corresponding prescription.
8. Repeat with a different Week/Day; verify no changes to coach prescriptions.
9. Test invalid actual data and loss of network access: no new workout rows
   should be created, the in-memory draft stays, and a retry is allowed.
10. Confirm original Add Record, Quick Add and Records List continue working,
    including responsive desktop/mobile layout.

The automated Playwright exercise uses synthetic Google API mocks;
a user-authorized copy is still needed for real OAuth and network behavior.

### Phase 4 follow-up

Use `Sessions.planned_workout_id` to compute completion/adherence; allow
explicit editing of planned links in historical record edit flows and improve
recoverable in-progress drafts across page reloads. Neither is implied by a
successful Phase 3 log write.
