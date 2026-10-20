import { describe, expect, it } from "vitest";
import {
  createBlankNormalizedPlan, formatPlannedItem, formatPlannedLoad,
  formatPlannedReps, groupTrainingPlan, parseLocalPlanJson,
} from "../assets/js/training-plan-view.js";
import { createTrainingPlanRecords } from "../assets/js/training-plan-model.js";

describe("Training Plan UI formatting and grouping", () => {
  it("displays RPE, bodyweight, ranges, and unresolved coach prescriptions", () => {
    expect(formatPlannedReps({ reps_kind: "range", reps_min: 8, reps_max: 12 })).toBe("8–12 次");
    expect(formatPlannedReps({ reps_kind: "until_rpe", reps_rpe: 7 })).toBe("至 RPE 7");
    expect(formatPlannedLoad({ load_kind: "bodyweight" })).toContain("BW");
    expect(formatPlannedLoad({ load_kind: "rpe_target", load_rpe: 5 })).toBe("RPE 5");
    expect(formatPlannedItem({ item_kind: "exercise", target_sets: "3", reps_kind: "fixed", reps_value: "5", load_kind: "fixed", load_value: "50", load_unit: "kg" }))
      .toBe("3 組 · 5 次 · 50 kg");
    expect(formatPlannedItem({ item_kind: "activity", target_metric: "steps", target_minimum: "8500" }))
      .toBe("至少 8500 步");
    expect(formatPlannedReps({ reps_kind: "needs_review", reps_raw: "2025-08-12" })).toContain("待確認");
  });

  it("creates blank plans without inventing missing coach prescriptions", () => {
    const normalized = createBlankNormalizedPlan(4, 3);
    let counter = 0;
    const records = createTrainingPlanRecords(normalized, { idFactory: () => "id-" + ++counter });
    expect(records.plan).toMatchObject({ week_count: 4, day_count: 3, status: "draft" });
    expect(records.workouts).toHaveLength(12);
    expect(records.workouts.every((w) => w.status === "not_provided")).toBe(true);
    expect(records.sets).toHaveLength(0);
    expect(() => createBlankNormalizedPlan(0, 7)).toThrow();
    expect(() => createBlankNormalizedPlan(4, 8)).toThrow();
  });

  it("groups scheduled workouts by week/day while sorting prescriptions", () => {
    const sheet = {
      plans: [{ plan_id: "p", title: "Plan", week_count: "2" }],
      workouts: [
        { workout_id: "w2", plan_id: "p", week_number: "1", day_number: "2", status: "planned" },
        { workout_id: "w1", plan_id: "p", week_number: "1", day_number: "1", status: "planned" },
      ],
      sets: [
        { planned_set_id: "s2", workout_id: "w1", exercise_order: "2" },
        { planned_set_id: "s1", workout_id: "w1", exercise_order: "1" },
        { planned_set_id: "sOther", workout_id: "else", exercise_order: "1" },
      ],
    };
    expect(groupTrainingPlan(sheet, "p").weeks).toMatchObject([
      { week: 1, workouts: [
        { day_number: "1", items: [{ planned_set_id: "s1" }, { planned_set_id: "s2" }] },
        { day_number: "2", items: [] },
      ] },
      { week: 2, workouts: [] },
    ]);
    expect(groupTrainingPlan(sheet, "none")).toBeNull();
    expect(sheet.sets[0].planned_set_id).toBe("s2");
  });

  it("rejects malformed/oversized source JSON safely", () => {
    const blank = createBlankNormalizedPlan(1, 1);
    expect(parseLocalPlanJson(JSON.stringify(blank))).toEqual(blank);
    expect(() => parseLocalPlanJson("oops")).toThrow("JSON");
    expect(() => parseLocalPlanJson(JSON.stringify({ ...blank, version: 2 }))).toThrow("版本");
    expect(() => parseLocalPlanJson("x".repeat(1048577))).toThrow("1 MB");
  });
});
