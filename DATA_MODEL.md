# Data Model

Google Sheets is the source of truth. Each field occupies its own column; JSON
blobs and fixed column indexes are prohibited. Readers map columns by header name
so additive schema changes remain backward-compatible.

## Workbook identity

Every compatible spreadsheet contains these sheets:

```text
Sessions
Sets
Goals
Settings
Schema
Exercises
```

Schema version `1` uses the following `Schema` key/value rows:

| key | value |
| --- | --- |
| app_id | powerlifting-training-tracker |
| schema_version | 1 |
| created_at | ISO 8601 timestamp |
| last_migrated_at | ISO 8601 timestamp |

## Sessions

```text
session_id,started_at,ended_at,training_date,title,body_weight_kg,
duration_minutes,notes,created_at,updated_at,schema_version
```

- `session_id`: UUID and immutable primary key.
- `training_date`: required local calendar date (`YYYY-MM-DD`).
- `started_at`, `ended_at`: optional ISO 8601 timestamps.
- `body_weight_kg`: optional finite positive number.
- `duration_minutes`: optional positive integer.
- `created_at`, `updated_at`: ISO 8601 timestamps.
- `schema_version`: integer row version, initially `1`.

## Sets

```text
set_id,session_id,exercise_name,exercise_category,set_order,weight_kg,reps,
rpe,is_warmup,set_type,notes,created_at,updated_at
```

- `set_id`: UUID and immutable primary key.
- `session_id`: required reference to Sessions.
- `exercise_name`: required trimmed text.
- `exercise_category`: `squat`, `bench`, `deadlift`, or `accessory`.
- `set_order`: positive integer within the exercise entry.
- `weight_kg`: finite number greater than or equal to zero, step `0.5` in UI.
- `reps`: integer greater than or equal to one.
- `rpe`: optional value from 1 through 10 in increments of `0.5`.
- `is_warmup`: boolean.
- `set_type`: `warmup`, `working`, `backoff`, `top`, or `amrap`.

## Goals

```text
goal_id,lift,target_weight_kg,current_weight_kg,target_date,notes,updated_at
```

`lift` is `squat`, `bench`, or `deadlift`. `current_weight_kg` is persisted
explicitly; computed best-single and estimated-1RM values are displayed
separately and do not silently overwrite it.

## Exercises

```text
exercise_id,exercise_name,category,is_default,is_active,last_used_at,created_at
```

Names are deduplicated by a normalized, trimmed, case-folded comparison while the
original display spelling is retained. Initial active defaults are Squat, Bench
Press, Deadlift, Paused Squat, Close-Grip Bench Press, Romanian Deadlift, and
Barbell Row.

## Settings

```text
key,value,updated_at
```

Initial values are `weight_unit=kg`, `locale=zh-TW`, `theme=system`, and
`default_rpe_enabled=false`. Future keys are additive.

## Domain calculations

- Set volume: `weightKg * reps`.
- All-sets volume: sum of every valid set.
- Working volume: exclude `is_warmup=true` or `set_type=warmup`.
- Estimated 1RM: weight for a single; otherwise Epley
  `weightKg * (1 + reps / 30)`. Sets above 12 reps are excluded from PR ranking.
- Goal progress: `current / target * 100`; UI bars clamp to 100%, while the text
  may show the actual percentage.

Statistics functions accept invalid or empty input safely, do not mutate their
arguments, and have no browser or Google API dependencies.

## Sorting and grouping

Sessions sort by `training_date DESC`, then `created_at DESC`. Sets are grouped
by `session_id`, then exercise, and ordered by `set_order`. Record deletion and
lookup always use IDs, never row numbers cached across requests.

## Migration rules

Validation checks required sheet names, `app_id`, supported schema version, and
required headers. Repair may create missing sheets or append missing headers but
must not rename, reorder, or discard user columns. Any destructive migration
requires a future versioned plan and explicit confirmation.
