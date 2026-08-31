import { describe, expect, it } from "vitest";
import { resolveReferenceOneRepMax } from "../assets/js/one-rep-max.js";
import { createQuickAddShareInput, generateQuickAddDraft, generateWarmupSets, getTrainingModeWarnings, parseManualOneRepMax, roundWeight, TRAINING_MODES } from "../assets/js/quick-add.js";
import { createWorkoutRecords, validateWorkoutInput } from "../assets/js/record-validation.js";

function generate(modeId, referenceOneRepMax = 100, includeWarmup = false) {
  return generateQuickAddDraft({
    liftId: "squat",
    modeId,
    referenceOneRepMax,
    trainingDate: "2026-08-21",
    includeWarmup,
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

  it("accepts only positive half-kilogram manual maximums", () => {
    expect(parseManualOneRepMax("100.5")).toBe(100.5);
    expect(parseManualOneRepMax("100.2")).toBeNull();
    expect(parseManualOneRepMax("0")).toBeNull();
    expect(parseManualOneRepMax("")).toBeNull();
  });

  it("returns guidance without blocking a workout that diverges from its mode", () => {
    const strength = generate("strength");
    strength.exercises[0].sets[0].reps = "12";
    expect(getTrainingModeWarnings("strength", strength.exercises, 100)).toEqual([
      "目前次數較高，訓練刺激可能逐漸偏向肌肥大或肌耐力。",
    ]);
    expect(validateWorkoutInput(strength)).toEqual([]);
  });

  it("exports every edited set with complete mode guidance regardless of completion state", () => {
    const draft = generate("strength");
    const exercises = draft.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set, index) => ({ ...set, completed: index === 0 })),
    }));
    const input = createQuickAddShareInput(draft, exercises, "75");
    expect(input.exercises[0].sets).toHaveLength(4);
    expect(input.exercises[0].sets[0]).not.toHaveProperty("completed");
    expect(input.durationMinutes).toBe("75");
    expect(input.notes).toContain("訓練目的：");
    expect(input.notes).toContain("組間休息：");
    expect(validateWorkoutInput(input)).toEqual([]);
  });
});

describe("Quick Add warm-up V1", () => {
  it("builds progressive warm-up sets from working weight with 2.5 kg rounding", () => {
    const sets = generateWarmupSets({ workingWeightKg: 100 });
    expect(sets.map((set) => [set.weightKg, set.reps])).toEqual([
      [20, 10],
      [40, 5],
      [60, 3],
      [75, 2],
      [85, 1],
    ]);
    expect(sets.every((set) => set.isWarmup && set.type === "warmup" && set.rpe === "")).toBe(true);
  });

  it("deduplicates light warm-ups and never reaches the working weight", () => {
    const sets = generateWarmupSets({ workingWeightKg: 40 });
    expect(sets.length).toBeLessThanOrEqual(3);
    expect(new Set(sets.map((set) => set.weightKg)).size).toBe(sets.length);
    expect(sets.every((set) => set.weightKg < 40)).toBe(true);
  });

  it("returns no warm-up when working weight is at or below the bar weight", () => {
    expect(generateWarmupSets({ workingWeightKg: 20 })).toEqual([]);
    expect(generateWarmupSets({ workingWeightKg: 15 })).toEqual([]);
  });

  it("prepends warm-up sets before the existing working sets when enabled", () => {
    const draft = generate("strength", 100, true);
    const sets = draft.exercises[0].sets;
    const warmups = sets.filter((set) => set.isWarmup);
    const working = sets.filter((set) => !set.isWarmup);
    expect(warmups.length).toBeGreaterThan(0);
    expect(working).toHaveLength(4);
    expect(sets.slice(0, warmups.length).every((set) => set.type === "warmup")).toBe(true);
    expect(working.every((set) => set.type === "working")).toBe(true);
  });

  it("persists warm-up flags through the existing Sessions/Sets record pipeline", () => {
    const draft = generate("strength", 100, true);
    expect(validateWorkoutInput(draft)).toEqual([]);
    const records = createWorkoutRecords(draft);
    const warmups = records.sets.filter((set) => set.is_warmup === "true");
    expect(warmups.length).toBeGreaterThan(0);
    expect(warmups.every((set) => set.set_type === "warmup")).toBe(true);
    expect(records.sets.map((set) => Number(set.set_order))).toEqual(
      Array.from({ length: records.sets.length }, (_, index) => index + 1),
    );
  });

  it("does not let warm-up reps trigger training-mode divergence warnings", () => {
    const draft = generate("strength", 100, true);
    expect(draft.exercises[0].sets.some((set) => set.isWarmup && Number(set.reps) > 8)).toBe(true);
    expect(getTrainingModeWarnings("strength", draft.exercises, 100)).toEqual([]);
  });

  it("keeps warm-up metadata in Quick Add share export", () => {
    const draft = generate("strength", 100, true);
    const input = createQuickAddShareInput(draft, draft.exercises, "60");
    const warmups = input.exercises[0].sets.filter((set) => set.isWarmup);
    expect(warmups.length).toBeGreaterThan(0);
    expect(warmups.every((set) => set.type === "warmup")).toBe(true);
    expect(validateWorkoutInput(input)).toEqual([]);
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