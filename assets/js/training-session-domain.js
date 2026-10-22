// Phase 3: link actual Sessions/Sets to planned prescriptions without
// changing the legacy v1 required columns or treating targets as performance.
import { plannedRowsToExercises } from "./training-plan-editor.js";
import { formatPlannedItem } from "./training-plan-view.js";
import { createWorkoutRecords, validateWorkoutInput } from "./record-validation.js";

export const EXECUTION_LINK_HEADERS = Object.freeze({
  Sessions: ["plan_id", "planned_workout_id"],
  Sets: ["planned_set_id"],
});

export function buildExecutionHeaderRepairs(headerRows) {
  return Object.entries(EXECUTION_LINK_HEADERS).flatMap(([title, columns]) => {
    const headers = (headerRows[title] ?? []).map((h) => String(h).trim());
    if (headers.length !== new Set(headers).size) throw new Error(title + " 包含重複欄位。");
    const missing = columns.filter((h) => !headers.includes(h));
    if (!missing.length) return [];
    let index = headers.length + 1;
    let col = "";
    while (index) {
      col = String.fromCharCode(65 + (index - 1) % 26) + col;
      index = Math.floor((index - 1) / 26);
    }
    return [{ range: title + "!" + col + "1", values: [missing] }];
  });
}

function todayLocal(now = new Date()) {
  const shift = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - shift).toISOString().slice(0, 10);
}

export function buildPlannedTrainingDraft(plan, workout, { now = new Date() } = {}) {
  if (!plan?.plan_id || !workout?.workout_id || plan.plan_id !== workout.plan_id) {
    throw new Error("訓練計畫與訓練日不相符。");
  }
  if (plan.status === "archived") throw new Error("已封存的課表不能直接啟動訓練。");
  if (workout.status !== "planned" || !workout.items?.length) {
    throw new Error("此訓練日沒有可執行的處方。");
  }
  const exercises = plannedRowsToExercises(workout.items);
  const skipped = exercises.filter(x => x.planKind === "activity").map(x => x.name);
  const actualExercises = exercises.filter(x => x.planKind !== "activity").map((exercise) => {
    const isLegacy = workout.items.some((row) =>
      row.planned_set_id === exercise.groupId && !row.exercise_group_id);
    return {
      name: exercise.name, category: exercise.category,
      sets: exercise.sets.map((set) => {
        const planned = workout.items.find((row) => row.planned_set_id === set.plannedSetId);
        const original = planned ?? (isLegacy
          ? workout.items.find((row) => row.planned_set_id === exercise.groupId)
          : null);
        const weightIsKg = set.loadKind === "fixed" && set.loadUnit === "kg";
        const repsAreFixed = set.repsKind === "fixed";
        return {
          plannedSetId: set.plannedSetId || (isLegacy ? exercise.groupId : ""),
          target: original ? formatPlannedItem(original) : "請確認教練目標",
          // The plan's 「紀錄」 belongs to the prescription. Show it below
          // the coach target, never prefill the editable actual-set notes.
          planRecord: String(set.notes ?? ""),
          // Never copy a planned RPE into actual RPE; do not invent BW/kg or
          // reps for ranges, RPE-until, and date-coerced cells.
          weightKg: weightIsKg ? set.weightKg : "",
          reps: repsAreFixed ? set.reps : "",
          rpe: "", completed: false,
          type: set.type, isWarmup: set.isWarmup,
          notes: "",
        };
      }),
    };
  });
  if (!actualExercises.length) throw new Error("此日只有步數等活動目標，沒有可記錄的組數。");
  return {
    planId: plan.plan_id, workoutId: workout.workout_id,
    planTitle: plan.title, trainingDate: todayLocal(now),
    title: workout.title || ("Week " + workout.week_number + " Day " + workout.day_number),
    durationMinutes: "60", notes: "",
    exercises: actualExercises, skipped,
    startedAt: now.toISOString(),
  };
}

export function prepareCompletedPlannedWorkout(draft, editorExercises, {
  sessionId, endedAt = new Date().toISOString(),
  trainingDate = draft?.trainingDate,
  durationMinutes = draft?.durationMinutes,
  notes = draft?.notes ?? "",
} = {}) {
  if (!draft?.planId || !draft?.workoutId || !sessionId) {
    throw new Error("訓練來源或紀錄 ID 不完整。");
  }
  const completed = editorExercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.filter((set) => set.completed),
  })).filter((exercise) => exercise.sets.length);
  if (!completed.length) throw new Error("請至少勾選一組已完成的訓練。");
  const input = {
    trainingDate, title: draft.title, durationMinutes, notes,
    exercises: completed,
  };
  const errors = validateWorkoutInput(input);
  if (errors.length) throw new Error(errors.join(" "));
  const records = createWorkoutRecords(input, {
    sessionId, startedAt: draft.startedAt, endedAt,
  });
  records.session.plan_id = draft.planId;
  records.session.planned_workout_id = draft.workoutId;
  // The existing record writer only reads the optional named header on Sheets
  // when it is present; migration verifies it before linked writes.
  let index = 0;
  for (const exercise of completed) {
    for (const set of exercise.sets) {
      records.sets[index].planned_set_id = set.plannedSetId || "";
      index += 1;
    }
  }
  return { input, records };
}
