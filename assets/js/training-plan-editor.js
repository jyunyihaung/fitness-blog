// Shared workout-editor bridge: planned prescriptions map to the same
// exercise -> sets shape as Quick Add and Add Record, with plan-only metadata.
import { validateTrainingPlanRecords } from "./training-plan-model.js";

const str = (value) => String(value ?? "");
const kind = (value, fallback) => value || fallback;

export function plannedRowsToExercises(rows = []) {
  const groups = new Map();
  const sorted = [...rows].sort((a, b) => Number(a.exercise_order) - Number(b.exercise_order));
  for (const row of sorted) {
    const id = row.exercise_group_id || row.planned_set_id;
    if (!groups.has(id)) groups.set(id, {
      groupId: id,
      name: row.exercise_name,
      category: row.exercise_category || "accessory",
      planKind: row.item_kind || "exercise",
      sets: [],
    });
    const exercise = groups.get(id);
    const count = row.exercise_group_id ? 1 : Math.max(1, Number(row.target_sets) || 1);
    for (let i = 0; i < count; i += 1) {
      exercise.sets.push({
        plannedSetId: row.exercise_group_id ? row.planned_set_id : i === 0 ? row.planned_set_id : "",
        weightKg: row.load_kind === "fixed" ? str(row.load_value) : "0",
        reps: row.reps_kind === "fixed" ? str(row.reps_value) : "1",
        rpe: "",
        type: row.set_type || (row.item_kind === "warmup" ? "warmup" : "working"),
        isWarmup: row.is_warmup === "true" || row.item_kind === "warmup",
        notes: row.set_notes || row.coach_notes || "",
        repsKind: kind(row.reps_kind, "unspecified"),
        repsMin: str(row.reps_min), repsMax: str(row.reps_max),
        repsRpe: str(row.reps_rpe), repsRaw: str(row.reps_raw),
        loadKind: kind(row.load_kind, "unspecified"),
        loadValue: str(row.load_value), loadUnit: kind(row.load_unit, "kg"),
        loadOperator: kind(row.load_operator, "<"), loadRpe: str(row.load_rpe),
        loadRaw: str(row.load_raw),
        targetMinimum: str(row.target_minimum),
        sourceRow: str(row.source_row),
      });
    }
  }
  return [...groups.values()];
}

export function exercisesToPlannedRows(workoutId, exercises, {
  now = new Date().toISOString(),
  idFactory = () => crypto.randomUUID(),
} = {}) {
  if (!Array.isArray(exercises) || exercises.length > 300) throw new Error("動作數量超出範圍。");
  const items = [];
  const ids = new Set();
  exercises.forEach((exercise, index) => {
    const name = str(exercise.name).trim();
    if (!name || name.length > 120) throw new Error("動作 " + (index + 1) + "：請輸入動作名稱。");
    if (!["squat", "bench", "deadlift", "accessory"].includes(exercise.category)) throw new Error("動作分類無效。");
    if (!["exercise", "warmup", "cooldown", "activity"].includes(exercise.planKind || "exercise")) throw new Error("動作類型無效。");
    if (!Array.isArray(exercise.sets) || !exercise.sets.length || exercise.sets.length > 100) throw new Error("每個動作需有 1–100 組。");
    const groupId = exercise.groupId || idFactory();
    for (const [setIndex, set] of exercise.sets.entries()) {
      if (items.length >= 2000) throw new Error("課表組數超出範圍。");
      const id = set.plannedSetId || idFactory();
      if (ids.has(id)) throw new Error("組別 ID 重複。");
      ids.add(id);
      const repsKind = kind(set.repsKind, "fixed");
      const loadKind = kind(set.loadKind, "fixed");
      const row = {
        planned_set_id: id, workout_id: workoutId, exercise_order: items.length + 1,
        exercise_group_id: groupId, set_order: setIndex + 1,
        exercise_name: name, exercise_category: exercise.category,
        item_kind: exercise.planKind || "exercise", target_sets: 1,
        reps_kind: repsKind,
        reps_value: repsKind === "fixed" ? str(set.reps) : "",
        reps_min: repsKind === "range" ? str(set.repsMin) : "",
        reps_max: repsKind === "range" ? str(set.repsMax) : "",
        reps_rpe: repsKind === "until_rpe" ? str(set.repsRpe) : "",
        reps_raw: repsKind === "needs_review" ? str(set.repsRaw) : "",
        load_kind: loadKind,
        load_value: loadKind === "fixed" ? str(set.weightKg) : loadKind === "bounded" ? str(set.loadValue) : "",
        load_unit: ["fixed", "bounded"].includes(loadKind) ? kind(set.loadUnit, "kg") : "",
        load_operator: loadKind === "bounded" ? kind(set.loadOperator, "<") : "",
        load_rpe: loadKind === "rpe_target" ? str(set.loadRpe) : "",
        load_raw: loadKind === "needs_review" ? str(set.loadRaw) : "",
        target_metric: exercise.planKind === "activity" && set.targetMinimum ? "steps" : "",
        target_minimum: exercise.planKind === "activity" ? str(set.targetMinimum) : "",
        set_type: kind(set.type, "working"),
        is_warmup: String(Boolean(set.isWarmup || set.type === "warmup")),
        set_notes: str(set.notes),
        coach_notes: str(set.notes), source_row: str(set.sourceRow),
        created_at: now, updated_at: now,
      };
      if (!["working", "warmup", "backoff", "top", "amrap"].includes(row.set_type)) throw new Error("組別類型無效。");
      items.push(row);
    }
  });
  return items;
}

export function validatePlannedDayReplacement(plan, workouts, previousItems, workoutId, nextItems) {
  const target = workouts.find((w) => w.workout_id === workoutId);
  if (!target) throw new Error("找不到指定的訓練日。");
  const nextWorkouts = workouts.map((w) => w.workout_id === workoutId
    ? { ...w, status: nextItems.length ? "planned" : "not_provided" } : w);
  const candidate = {
    plan,
    workouts: nextWorkouts,
    sets: [...previousItems.filter((row) => row.workout_id !== workoutId), ...nextItems],
  };
  validateTrainingPlanRecords(candidate);
  return candidate;
}
