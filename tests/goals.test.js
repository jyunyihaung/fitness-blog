import { describe, expect, it } from "vitest";
import { createGoalProgress, createGoalRecords, parseGoals, validateGoals } from "../assets/js/goals.js";

describe("goals domain", () => {
  it("parses Goals by header name rather than fixed position", () => {
    const rows = [
      ["lift", "goal_id", "current_weight_kg", "target_weight_kg", "notes", "target_date", "updated_at"],
      ["squat", "goal-1", "100", "120", "Meet prep", "2027-01-31", "2026-08-20T00:00:00Z"],
    ];
    expect(parseGoals(rows)).toEqual([expect.objectContaining({
      id: "goal-1",
      lift: "squat",
      currentWeightKg: 100,
      targetWeightKg: 120,
    })]);
  });

  it("validates half-kilogram increments", () => {
    const goals = [{ id: "", lift: "bench", currentWeightKg: "75", targetWeightKg: "100.2", targetDate: "", notes: "" }];
    expect(validateGoals(goals)).toEqual([expect.stringContaining("0.5 kg")]);
  });

  it("creates goal rows and calculates progress separately from estimated 1RM", () => {
    const input = [{ id: "goal-1", lift: "squat", currentWeightKg: "100", targetWeightKg: "120", targetDate: "", notes: "" }];
    const [record] = createGoalRecords(input);
    const [progress] = createGoalProgress([
      { id: record.goal_id, lift: "squat", currentWeightKg: 100, targetWeightKg: 120 },
    ], [{ exercises: [{ category: "squat", sets: [{ weight: 100, reps: 5 }] }] }]);
    expect(record.current_weight_kg).toBe("100");
    expect(progress.progress).toBe(83.3);
    expect(progress.estimatedOneRepMax).toBe(116.7);
    expect(progress.currentWeightKg).toBe(100);
  });
});
