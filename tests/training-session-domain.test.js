import { describe, expect, it } from "vitest";
import {
  buildExecutionHeaderRepairs, buildPlannedTrainingDraft, prepareCompletedPlannedWorkout,
} from "../assets/js/training-session-domain.js";

const plan = { plan_id: "plan-a", title: "Coach Block1", status: "active" };
function workout(items) {
  return {
    workout_id: "workout-a", plan_id: "plan-a",
    title: "Week 1 Day 2", week_number: "1", day_number: "2",
    status: "planned", items,
  };
}
const row = (overrides = {}) => ({
  planned_set_id: "planned-1", workout_id: "workout-a", exercise_order: "1",
  exercise_group_id: "group-a", set_order: "1", exercise_name: "Pause Squat",
  exercise_category: "squat", item_kind: "exercise", target_sets: "1",
  reps_kind: "fixed", reps_value: "4",
  load_kind: "rpe_target", load_rpe: "5",
  set_type: "working", is_warmup: "false", ...overrides,
});

describe("Phase 3 planned workout execution", () => {
  it("starts from plan and maps fixed targets but does not make up actual RPE", () => {
    const draft = buildPlannedTrainingDraft(plan, workout([
      row({ planned_set_id: "s1", load_kind: "fixed", load_value: "50", load_unit: "kg" }),
      row({ planned_set_id: "s2", exercise_order: "2", set_order: "2", reps_kind: "range",
        reps_min: "8", reps_max: "12", load_kind: "rpe_target", load_rpe: "7" }),
      row({ planned_set_id: "s3", exercise_order: "3", exercise_group_id: "group-b",
        item_kind: "activity", target_metric: "steps", target_minimum: "8500" }),
    ]), { now: new Date("2026-10-22T08:00:00Z") });
    expect(draft.exercises).toHaveLength(1);
    expect(draft.exercises[0].sets).toHaveLength(2);
    expect(draft.exercises[0].sets[0]).toMatchObject({
      plannedSetId: "s1", weightKg: "50", reps: "4", rpe: "", completed: false,
    });
    expect(draft.exercises[0].sets[1]).toMatchObject({
      plannedSetId: "s2", weightKg: "", reps: "", rpe: "", completed: false,
    });
    expect(draft.exercises[0].sets[1].target).toContain("8–12");
    expect(draft.skipped).toEqual(["Pause Squat"]);
  });

  it("keeps each set's coach record below its target without copying it to actual notes", () => {
    const draft = buildPlannedTrainingDraft(plan, workout([
      row({ planned_set_id: "first", set_order: "1",
        set_notes: "保持核心繃緊\n控制離心", coach_notes: "較舊的教練備註" }),
      row({ planned_set_id: "second", exercise_order: "2", set_order: "2",
        set_notes: "", coach_notes: "最後一組維持節奏" }),
      row({ planned_set_id: "third", exercise_order: "3", set_order: "3",
        set_notes: "", coach_notes: "" }),
    ]));
    const sets = draft.exercises[0].sets;
    expect(sets.map((set) => set.planRecord)).toEqual([
      "保持核心繃緊\n控制離心", "最後一組維持節奏", "",
    ]);
    expect(sets.every((set) => set.notes === "")).toBe(true);
    expect(sets[0].target).toContain("RPE 5");
    // Read-only coach records never become completed-set free-text notes.
    const actual = structuredClone(draft.exercises);
    actual[0].sets[0] = { ...actual[0].sets[0],
      weightKg: "50", reps: "4", completed: true, notes: "實際完成順利" };
    const output = prepareCompletedPlannedWorkout(draft, actual, { sessionId: "record-isolation" });
    expect(output.records.sets[0].notes).toBe("實際完成順利");
    expect(output.records.sets[0].notes).not.toContain("核心繃緊");
  });

  it("expands legacy multi-set rows with the same source record for every set", () => {
    const draft = buildPlannedTrainingDraft(plan, workout([
      row({ exercise_group_id: "", target_sets: "3", set_notes: "",
        coach_notes: "教練紀錄：穩定下放" }),
    ]));
    expect(draft.exercises[0].sets).toHaveLength(3);
    expect(draft.exercises[0].sets.map((set) => set.planRecord))
      .toEqual(Array(3).fill("教練紀錄：穩定下放"));
  });

  it("requires manual performance for bodyweight, lb, unknown and date-coerced prescriptions", () => {
    const rows = [
      row({ planned_set_id: "bw", load_kind: "bodyweight" }),
      row({ planned_set_id: "lbs", exercise_order: "2", set_order: "2", load_kind: "fixed", load_unit: "lbs", load_value: "20" }),
      row({ planned_set_id: "bad", exercise_order: "3", set_order: "3",
        reps_kind: "needs_review", reps_raw: "2025-08-12",
        load_kind: "needs_review", load_raw: "2025-08-12" }),
    ];
    const draft = buildPlannedTrainingDraft(plan, workout(rows));
    expect(draft.exercises[0].sets.map(s => s.weightKg)).toEqual(["", "", ""]);
    expect(draft.exercises[0].sets.map(s => s.reps)).toEqual(["4", "4", ""]);
    expect(draft.exercises[0].sets[2].target).toContain("待確認");
  });

  it("writes only checked sets to actual Sessions/Sets with the original planned_set_id", () => {
    const draft = buildPlannedTrainingDraft(plan, workout([
      row({ planned_set_id: "first" }),
      row({ planned_set_id: "second", exercise_order: "2", set_order: "2" }),
    ]));
    const actual = draft.exercises.map(exercise => ({
      ...exercise,
      sets: exercise.sets.map((set, i) => ({
        ...set, weightKg: i ? "" : "60", reps: i ? "" : "4",
        rpe: i ? "" : "6.5", completed: i === 0,
      })),
    }));
    const output = prepareCompletedPlannedWorkout(draft, actual, {
      sessionId: "stable-session",
      endedAt: "2026-10-22T12:00:00Z",
      trainingDate: "2026-10-22",
      durationMinutes: "65",
    });
    expect(output.records.session).toMatchObject({
      session_id: "stable-session", plan_id: "plan-a", planned_workout_id: "workout-a",
      ended_at: "2026-10-22T12:00:00Z", duration_minutes: "65",
    });
    expect(output.records.sets).toHaveLength(1);
    expect(output.records.sets[0]).toMatchObject({
      session_id: "stable-session", planned_set_id: "first",
      weight_kg: "60", reps: "4", rpe: "6.5",
    });
    expect(output.records.session.started_at).toBe(draft.startedAt);
    expect(draft.exercises[0].sets[0].rpe).toBe("");
  });

  it("rejects zero completion and unknown actual values before any Sheets write", () => {
    const draft = buildPlannedTrainingDraft(plan, workout([row()]));
    expect(() => prepareCompletedPlannedWorkout(draft, draft.exercises, {
      sessionId: "id",
    })).toThrow("至少勾選");
    const actual = structuredClone(draft.exercises);
    actual[0].sets[0].completed = true;
    expect(() => prepareCompletedPlannedWorkout(draft, actual, {
      sessionId: "id",
    })).toThrow("重量");
    actual[0].sets[0].weightKg = "60";
    expect(() => prepareCompletedPlannedWorkout(draft, actual, {
      sessionId: "id",
    })).not.toThrow();
  });

  it("rejects absent, mismatched and archived plans, or activity-only days", () => {
    expect(() => buildPlannedTrainingDraft({ ...plan, plan_id: "other" }, workout([row()])))
      .toThrow("不相符");
    expect(() => buildPlannedTrainingDraft({ ...plan, status: "archived" }, workout([row()])))
      .toThrow("已封存");
    expect(() => buildPlannedTrainingDraft(plan, workout([
      row({ item_kind: "activity", target_metric: "steps", target_minimum: "8000" }),
    ]))).toThrow("沒有可記錄");
  });
});

describe("Opt-in session linkage migration", () => {
  it("appends only missing named columns to the end, never rearranging existing columns", () => {
    expect(buildExecutionHeaderRepairs({
      Sessions: ["notes", "session_id"],
      Sets: ["set_id", "session_id", "planned_set_id"],
    })).toEqual([{
      range: "Sessions!C1", values: [["plan_id", "planned_workout_id"]],
    }]);
    expect(buildExecutionHeaderRepairs({
      Sessions: ["session_id", "plan_id", "planned_workout_id"],
      Sets: ["set_id", "planned_set_id"],
    })).toEqual([]);
  });

  it("fails on duplicate headers", () => {
    expect(() => buildExecutionHeaderRepairs({
      Sessions: ["session_id", "session_id"], Sets: [],
    })).toThrow("重複");
  });
});
