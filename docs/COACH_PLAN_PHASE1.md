# Phase 1 — Training Plan data model and Google Sheets storage

## Status and scope

This phase adds three opt-in, additive Google Sheets tabs for planned workouts,
plus a pure normalization mapper, validation, read/create/update APIs, and a
Settings button to prepare existing workbooks. It does **not** create any actual
training records from plans. Phase 2 provides plan navigation and Phase 3
provides workout execution.

## Compatibility strategy

Existing workbook identity remains `app_id=powerlifting-training-tracker` and
`schema_version=1`. Existing required tabs remain Sessions, Sets, Goals,
Settings, Schema and Exercises; they stay compatible without an automatic
migration. Training Plan is a separately versioned extension identified by
the key `training_plan_schema_version=1` in the existing Schema tab.

- **New workbooks:** created with the original six tabs plus the three Plan
  tabs and the extension version key.
- **Existing workbooks:** use Settings -> 啟用訓練計畫資料表 and accept the
  confirmation dialog. The migration adds missing Plan tabs/headers and a
  Schema version marker; it does not rewrite, reorder, or delete historical
  Sessions/Sets or any custom columns.
- **Existing workflows:** validation and legacy repair continue to require only
  the six original tabs. Plan reads/writes reject missing or mismatched
  extension versions; they do not auto-migrate.
- **Future schema changes:** increment the plan extension version separately,
  and reject unknown versions without mutating the workbook.

## Logical relationships

```text
TrainingPlans       1 ─── N PlannedWorkouts     1 ─── N PlannedSets
  plan_id (PK)               workout_id (PK)            planned_set_id (PK)
                             plan_id (FK)               workout_id (FK)
                             week_number
                             day_number

Sessions / Sets (actual completed workouts): UNCHANGED.
```

Identifiers are stable for each persisted plan. Week/day and exercise order
are indexed as data, not as Google Sheet row positions. All Google Sheet
readers map columns by their *header names* to support additive columns and
manual column reordering.

## Tabs and headers

### TrainingPlans

```text
plan_id,title,block_name,week_count,day_count,status,source_sheet,notes,
created_at,updated_at,plan_schema_version
```

Status: draft, active or archived. Imported plans start as draft.

### PlannedWorkouts

```text
workout_id,plan_id,week_number,day_number,planned_date,title,status,notes,
created_at,updated_at
```

Status: planned or not_provided. A Week 2–4 with no instruction is represented
explicitly as not_provided with **zero child sets**. Planned dates are optional
and never inferred by Phase 1.

### PlannedSets

Each row represents one **ordered exercise or activity prescription**, not a
performed set. `target_sets` specifies the intended count for the exercise.

```text
planned_set_id,workout_id,exercise_order,exercise_name,item_kind,target_sets,
reps_kind,reps_value,reps_min,reps_max,reps_rpe,reps_raw,
load_kind,load_value,load_unit,load_operator,load_rpe,load_raw,
target_metric,target_minimum,coach_notes,source_row,created_at,updated_at
```

- `item_kind`: exercise, warmup, cooldown, activity
- `reps_kind`: unspecified, fixed, range, until_rpe, needs_review
- `load_kind`: unspecified, fixed, bodyweight, rpe_target, bounded, needs_review
- `load_unit`: kg, lb or lbs for numeric weight constraints
- `target_metric`: currently steps, with `target_minimum` integer
- `reps_raw` / `load_raw`: source content needing manual review, not guessed
- `coach_notes`: technique instruction or other prescription note

The Phase 0 actual columns are intentionally ignored by the plan importer.
Never treat source worksheet actual-weight and RPE examples as authoritative
Sessions/Sets. In Phase 3, save performed sets explicitly through the existing
validated history pipeline, and link to these planned IDs through a separately
reviewed additive schema.

## API

```js
import { createTrainingPlanRecords } from "./training-plan-model.js";
import {
  enableTrainingPlanStorage,
  listTrainingPlanRecords,
  getTrainingPlanRecords,
  createTrainingPlan,
  updateTrainingPlanMetadata,
} from "./training-plan-storage.js";

const input = createTrainingPlanRecords(phase0Json, { title: "教練課表" });
// On previously connected workbooks, user must first confirm migration in Settings.
await createTrainingPlan(spreadsheetId, accessToken, input);
const summary = await listTrainingPlanRecords(spreadsheetId, accessToken);
const plan = await getTrainingPlanRecords(spreadsheetId, accessToken, input.plan.plan_id);
await updateTrainingPlanMetadata(spreadsheetId, accessToken, input.plan.plan_id,
  { title: "更新名稱", status: "active" });
```

The create operation writes parent, workouts and planned items in one
Sheets `:batchUpdate` request. IDs are checked for duplicates before writing.
Metadata updates preserve existing workouts and planned items; Phase 1 does
not yet provide full plan-content editing or delete operations.

## Review gates

- [x] Training Plan data model uses named columns, unique identifiers and FK checks
- [x] No changes to the original six sheet headers or base schema version
- [x] Explicit, additive migration path for existing users
- [x] New workbooks include all three plan tabs
- [x] Reading, creation and metadata update APIs
- [x] Synthetic unit and fake Google Sheets integration tests
- [ ] Verify real migration on a user-approved **backup** of a Google workbook
- [ ] Release Gate V2 passes for the PR

No real private coach worksheet or personal activity data is committed to Git.
