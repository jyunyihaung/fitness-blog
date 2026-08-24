import { describe, expect, it } from "vitest";
import {
  normalizeExerciseName,
  parseExercises,
  planExerciseSync,
  sortExerciseSuggestions,
  validateExerciseInput,
} from "../assets/js/exercises.js";

const rows = [
  ["category", "exercise_name", "exercise_id", "is_active", "is_default", "last_used_at", "created_at"],
  ["squat", "Squat", "squat", "true", "true", "2026-08-24T00:00:00Z", "2026-01-01T00:00:00Z"],
  ["accessory", "Barbell Row", "row", "false", "false", "", "2026-01-01T00:00:00Z"],
];

describe("exercise domain", () => {
  it("normalizes Unicode, casing, and repeated whitespace", () => {
    expect(normalizeExerciseName("  ＳＱＵＡＴ   Day ")).toBe("squat day");
  });

  it("parses named headers and boolean values", () => {
    expect(parseExercises(rows)).toEqual([
      expect.objectContaining({ id: "squat", name: "Squat", category: "squat", isActive: true }),
      expect.objectContaining({ id: "row", isActive: false }),
    ]);
  });

  it("rejects active duplicates and identifies inactive duplicates", () => {
    const exercises = parseExercises(rows);
    expect(validateExerciseInput({ name: " squat ", category: "squat" }, exercises)).toContain("已有相同名稱的動作。");
    expect(validateExerciseInput({ name: "BARBELL   ROW", category: "accessory" }, exercises)[0]).toContain("停用動作");
  });

  it("sorts recent active exercises and hides inactive entries", () => {
    expect(sortExerciseSuggestions(parseExercises(rows)).map((exercise) => exercise.id)).toEqual(["squat"]);
  });

  it("plans updates by normalized name and appends missing exercises", () => {
    const plan = planExerciseSync(parseExercises(rows), [
      { name: " squat ", category: "squat" },
      { name: "Tempo Squat", category: "squat" },
    ], "2026-08-25T00:00:00Z");
    expect(plan[0]).toEqual(expect.objectContaining({ type: "update", id: "squat" }));
    expect(plan[0].record.last_used_at).toBe("2026-08-25T00:00:00Z");
    expect(plan[1]).toEqual(expect.objectContaining({ type: "append" }));
  });
});
