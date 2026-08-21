import { describe, expect, it } from "vitest";
import { resolveReferenceOneRepMax } from "../assets/js/one-rep-max.js";
import { generateQuickAddDraft, getTrainingModeWarnings, roundWeight, TRAINING_MODES } from "../assets/js/quick-add.js";
import { createWorkoutRecords, validateWorkoutInput } from "../assets/js/record-validation.js";

function generate(modeId, referenceOneRepMax = 100) {
  return generateQuickAddDraft({
    liftId: "squat",
    modeId,
    referenceOneRepMax,
    trainingDate: "2026-08-21",
  });
}

function workoutSet({ category = "squat", weight, reps, isWarmup = false, type = "working" }) {
  return [{ exercises: [{ category, sets: [{ weight, reps, isWarmup, type }] }] }];
}

describe("Quick Add prescription generation", () => {
  it("keeps complete guidance content in every training mode config", () => {
    Object.values(TRAINING_MODES).forEach((mode) => {
      expect(mode.goal).toBeTruthy();
      expect(mode.rest).toBeTruthy();
      expect(mode.shortTip).toBeTruthy();
      expect(mode.tips.length).toBeGreaterThan(0);
    });
  });

  it("calculates 100 kg × 85% as 85 kg", () => {
    expect(generate("strength").quickAdd.weight).toBe(85);
  });

  it("calculates 70 kg × 70% as 49 kg using the 0.5 kg increment", () => {
    expect(roundWeight(70 * 0.7)).toBe(49);
    expect(generate("hypertrophy", 70).quickAdd.weight).toBe(49);
  });

  it.each([
    ["strength", 4, 3],
    ["hypertrophy", 4, 8],
    ["volume", 5, 5],
  ])("generates the %s preset as %i sets × %i reps", (modeId, setCount, reps) => {
    const draft = generate(modeId);
    expect(draft.exercises[0].sets).toHaveLength(setCount);
    expect(draft.exercises[0].sets.every((set) => Number(set.reps) === reps)).toBe(true);
  });

  it("generates ordered non-warmup working sets through the existing record pipeline", () => {
    const draft = generate("strength");
    expect(validateWorkoutInput(draft)).toEqual([]);
    const records = createWorkoutRecords(draft);
    expect(records.sets.map((set) => set.set_order)).toEqual(["1", "2", "3", "4"]);
    expect(records.sets.every((set) => set.set_type === "working" && set.is_warmup === "false")).toBe(true);
    expect(records.sets.every((set) => set.session_id === records.session.session_id)).toBe(true);
  });

  it("rejects missing or invalid reference 1RM safely", () => {
    expect(resolveReferenceOneRepMax({ lift: "squat" })).toBeNull();
    expect(() => generate("strength", 0)).toThrow("大於 0");
  });

  it("returns guidance without blocking a workout that diverges from its mode", () => {
    const strength = generate("strength");
    strength.exercises[0].sets[0].reps = "12";
    expect(getTrainingModeWarnings("strength", strength.exercises, 100)).toEqual([
      "目前次數較高，訓練刺激可能逐漸偏向肌肥大或肌耐力。",
    ]);
    expect(validateWorkoutInput(strength)).toEqual([]);
  });
});

describe("Quick Add reference 1RM resolution", () => {
  it("uses Goal current weight before historical and manual values", () => {
    const reference = resolveReferenceOneRepMax({
      lift: "squat",
      goals: [{ lift: "squat", currentWeightKg: 120 }],
      workouts: workoutSet({ weight: 125, reps: 1 }),
      manualOneRepMax: 130,
    });
    expect(reference).toEqual({ value: 120, source: "goal-current" });
  });

  it("uses a historical best single before estimated 1RM", () => {
    const workouts = [
      ...workoutSet({ weight: 100, reps: 1 }),
      ...workoutSet({ weight: 95, reps: 5 }),
    ];
    expect(resolveReferenceOneRepMax({ lift: "squat", workouts })).toEqual({ value: 100, source: "best-single" });
  });

  it("falls back from estimated 1RM to a manual value", () => {
    expect(resolveReferenceOneRepMax({ lift: "squat", workouts: workoutSet({ weight: 90, reps: 5 }) }))
      .toEqual({ value: 105, source: "estimated" });
    expect(resolveReferenceOneRepMax({ lift: "squat", manualOneRepMax: 80 }))
      .toEqual({ value: 80, source: "manual" });
  });

  it("ignores warm-up sets while resolving historical 1RM", () => {
    const workouts = workoutSet({ weight: 200, reps: 1, isWarmup: true });
    expect(resolveReferenceOneRepMax({ lift: "squat", workouts, manualOneRepMax: 90 }))
      .toEqual({ value: 90, source: "manual" });
  });
});
