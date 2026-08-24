import { describe, expect, it } from "vitest";
import { createWorkoutRecords, validateWorkoutInput } from "../assets/js/record-validation.js";

function validInput() {
  return {
    trainingDate: "2026-08-20",
    title: "  Squat day  ",
    durationMinutes: "5",
    notes: "  Follow the coach plan.  ",
    exercises: [{
      name: "  Squat  ",
      category: "squat",
      sets: [
        { weightKg: "100", reps: "5", rpe: "8", type: "working", isWarmup: false },
        { weightKg: "80", reps: "5", rpe: "", type: "warmup", isWarmup: false },
      ],
    }],
  };
}

describe("workout record validation", () => {
  it("accepts a valid nested workout", () => {
    expect(validateWorkoutInput(validInput())).toEqual([]);
  });

  it("rejects invalid weight, reps, RPE, and missing fields", () => {
    const input = validInput();
    input.trainingDate = "";
    input.title = " ";
    input.exercises[0].sets[0] = {
      weightKg: "100.2",
      reps: "0",
      rpe: "10.5",
      type: "invalid",
      isWarmup: false,
    };
    expect(validateWorkoutInput(input)).toHaveLength(6);
  });

  it("creates linked Sessions and Sets records", () => {
    const records = createWorkoutRecords(validInput());
    expect(records.session.title).toBe("Squat day");
    expect(records.session.training_date).toBe("2026-08-20");
    expect(records.session.notes).toBe("Follow the coach plan.");
    expect(records.sets).toHaveLength(2);
    expect(records.sets.every((set) => set.session_id === records.session.session_id)).toBe(true);
    expect(records.sets.map((set) => set.set_order)).toEqual(["1", "2"]);
    expect(records.sets[1].is_warmup).toBe("true");
    expect(records.session.session_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
