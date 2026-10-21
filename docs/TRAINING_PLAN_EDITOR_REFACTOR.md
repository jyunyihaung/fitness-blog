# Training Plan editor UX refactor

## Decision: is "安排狀態" necessary?
No manual dropdown is needed. Phase 1 keeps `PlannedWorkouts.status`
(`planned` or `not_provided`) for backward compatibility and safe import.
The UI automatically changes the state based on the presence of planned
exercise prescriptions after a successful save. The unrelated plan-level
`draft/active/archived` status remains as an editable plan property.

## Shared editor and multi-set modeling
All three features now use `createWorkoutEditor`:
- **新增紀錄**: actual, completed Sessions/Sets
- **快速新增**: generated workouts, optional completion markers/rest timer
- **訓練課表**: intended per-set prescriptions, never performed workout records

The plan editor shares the name/classification, multiple exercises, multiple
sets, warmup/top/backoff set type, and per-set notes with Record / Quick Add.
It additionally exposes planned reps/load types (RPE targets, BW, range,
bound, unresolved raw value, steps). For planned exercises, rest timers and
completed checkboxes are not shown: these belong to execution (Phase 3).

## Data compatibility
`PlannedSets` gains optional named columns:

```text
exercise_group_id,set_order,set_type,is_warmup,set_notes,exercise_category
```

These are additive to Phase 1's existing header-addressed Google Sheets model.
Reopen **設定 -> 啟用訓練計畫資料表** for existing plan workbooks to append
the missing headers. It is an idempotent, non-destructive header repair.

Old rows without `exercise_group_id` remain valid: a single row with
`target_sets=3` is presented as **three editable sets**, sharing the same
coach prescription. When the user saves, the day becomes individual planned
rows, all connected by `exercise_group_id` and ordered by `set_order`.
A separate `exercise_order` guarantees unique row order.

Batch save updates the whole selected Day atomically (delete its old
PlannedSets, append the edited ones, update its status), and leaves other days,
plans and all completed Sessions/Sets untouched.

Do not equate planned RPE with actual RPE; plan-only fields remain distinct.
Never guess missing Excel rep ranges converted to dates.

## Manual tests on a backup Google Sheet

1. Ensure the selected Sheet is a backup and open Settings. Click the Training
   Plan schema enable/repair button once.
2. Create a blank 4x3 plan. Select Week1 Day1; confirm no manual status field.
3. Add two distinct exercises **without saving between them**, each with two
   or more sets. Use varied weights, reps, warmups/top sets and RPE targets.
4. Press **儲存本日所有動作** once. Check its PlannedSets rows and unique
   per-set order, reload the browser, and confirm all sets survive.
5. Add another exercise to the same day, save again, then edit an earlier
   set and delete a later set. Both the old and new exercises should remain
   as edited.
6. Remove *all* exercises and save; the day should automatically become
   not_provided. Add one again to see status planned.
7. For an imported Phase 0 plan with a legacy row of 2–3 target sets, load
   and save without changing it. Confirm 2–3 distinct target rows with
   no loss of BW/RPE/range/needs_review data.
8. Verify original Record and Quick Add still add several exercises/sets
   and that historical Sessions/Sets data is unchanged.
9. Recheck on a narrow phone screen for horizontal overflow.

The CI E2E uses a mocked Sheets API; a real backup Sheet remains a necessary
manual end-to-end verification step.
