import { describe, expect, it } from "vitest";
import {
  PLAN_HEADERS, PLAN_TITLES, createTrainingPlanRecords, validateTrainingPlanRecords,
} from "../assets/js/training-plan-model.js";

let next = 0;
function idFactory() {
  next += 1;
  return "generated-" + next;
}
function fixture() {
  next = 0;
  return {
    format: "fitness-blog-coach-plan",
    version: 1,
    source: { sheet: "Block1" },
    blocks: [{
      name: "Block1",
      weeks: [
        {
          week: 1, notes: ["Day2跟Day3需間隔一天"],
          workouts: [
            { day: 1, items: [
              {
                name: "Pause Squat", kind: "exercise",
                planned: { sets: 2, reps: { kind: "fixed", value: 4 },
                  load: { kind: "rpe_target", rpe: 5 } },
                actual: { load: { kind: "per_set", valuesKg: [60, 60] } },
                coachNotes: "底部暫停一秒", source: { row: 9 },
              },
              {
                name: "Walk", kind: "activity",
                planned: { sets: null, reps: { kind: "unspecified" },
                  load: { kind: "unspecified" }, target: { metric: "steps", minimum: 8500 } },
              },
              {
                name: "RDL", kind: "exercise",
                planned: { sets: 2, reps: { kind: "needs_review", raw: "2025-08-10" },
                  load: { kind: "bodyweight" } },
              },
            ] },
            { day: 2, items: [{
              name: "Pull ups", kind: "exercise", planned: {
                sets: 2, reps: { kind: "until_rpe", rpe: 7 }, load: { kind: "bodyweight" },
              },
            }] },
            { day: 3, items: [{
              name: "Hip internal rotation", kind: "exercise",
              planned: { sets: 2, reps: { kind: "range", min: 8, max: 12 },
                load: { kind: "bounded", operator: "<", value: 20, unit: "lbs" } },
            }] },
          ],
        },
        { week: 2, notes: [], workouts: [
          { day: 1, items: [] }, { day: 2, items: [] }, { day: 3, items: [] },
        ] },
      ],
    }],
  };
}

describe("Training Plan domain model (Phase 1)", () => {
  it("uses explicit, unique named columns rather than packing JSON in a cell", () => {
    expect(PLAN_TITLES).toEqual(["TrainingPlans", "PlannedWorkouts", "PlannedSets"]);
    for (const title of PLAN_TITLES) {
      expect(new Set(PLAN_HEADERS[title]).size).toBe(PLAN_HEADERS[title].length);
      expect(PLAN_HEADERS[title]).not.toContain("json");
      expect(PLAN_HEADERS[title].length).toBeGreaterThan(8);
    }
  });

  it("builds one plan with three populated and three empty training days", () => {
    const { plan, workouts, sets } = createTrainingPlanRecords(fixture(), { idFactory, now: "2026-10-20T00:00:00Z" });
    expect(plan).toMatchObject({
      plan_id: "generated-1", week_count: 2, day_count: 3, status: "draft", plan_schema_version: "1",
    });
    expect(workouts).toHaveLength(6);
    expect(sets).toHaveLength(5);
    expect(workouts.filter((workout) => workout.status === "not_provided")).toHaveLength(3);
    expect(sets.every((item) => workouts.some((workout) => workout.workout_id === item.workout_id))).toBe(true);
    expect(workouts[0].notes).toContain("需間隔一天");
  });

  it("keeps coach targets distinct from performance history, and marks ambiguous dates", () => {
    const { sets } = createTrainingPlanRecords(fixture(), { idFactory });
    const squat = sets.find((item) => item.exercise_name === "Pause Squat");
    expect(squat).toMatchObject({
      target_sets: 2, reps_kind: "fixed", reps_value: 4,
      load_kind: "rpe_target", load_rpe: 5, coach_notes: "底部暫停一秒",
    });
    expect(squat).not.toHaveProperty("actual");
    expect(squat).not.toHaveProperty("valuesKg");
    expect(sets.find((item) => item.exercise_name === "RDL"))
      .toMatchObject({ reps_kind: "needs_review", reps_raw: "2025-08-10" });
    expect(sets.find((item) => item.item_kind === "activity"))
      .toMatchObject({ target_metric: "steps", target_minimum: 8500 });
    expect(sets.find((item) => item.exercise_name === "Pull ups"))
      .toMatchObject({ load_kind: "bodyweight", reps_kind: "until_rpe", reps_rpe: 7 });
    expect(sets.find((item) => item.exercise_name === "Hip internal rotation"))
      .toMatchObject({
        reps_kind: "range", reps_min: 8, reps_max: 12,
        load_kind: "bounded", load_operator: "<", load_unit: "lbs", load_value: 20,
      });
  });

  it("fails closed on missing references, duplicate positions and invalid load ranges", () => {
    const baseline = createTrainingPlanRecords(fixture(), { idFactory });
    expect(() => validateTrainingPlanRecords({
      ...baseline, sets: [{ ...baseline.sets[0], workout_id: "missing" }],
    })).toThrow("不存在");
    expect(() => validateTrainingPlanRecords({
      ...baseline, sets: [baseline.sets[0], { ...baseline.sets[1],
        exercise_order: baseline.sets[0].exercise_order, workout_id: baseline.sets[0].workout_id }],
    })).toThrow("順序重複");
    expect(() => validateTrainingPlanRecords({
      ...baseline, sets: baseline.sets.map((s, i) => i === 0
        ? { ...s, load_kind: "bounded", load_value: 10, load_unit: "pounds" } : s),
    })).toThrow("單位");
    expect(() => validateTrainingPlanRecords({
      ...baseline, workouts: baseline.workouts.map((w, i) => i === 0
        ? { ...w, plan_id: "different" } : w),
    })).toThrow("其他計畫");
  });

  it("rejects unsupported source shapes before generating IDs or writing data", () => {
    expect(() => createTrainingPlanRecords({ ...fixture(), version: 2 }, { idFactory })).toThrow("僅支援");
    const bad = fixture();
    bad.blocks[0].weeks[0].workouts[0].items[0].planned.load = { kind: "rpe_target", rpe: 12 };
    expect(() => createTrainingPlanRecords(bad, { idFactory })).toThrow("RPE");
  });
});
