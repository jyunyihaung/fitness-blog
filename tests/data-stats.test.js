import { describe, expect, it } from "vitest";
import { mapSheetRecordsToWorkouts } from "../assets/js/data.js";
import { createStatistics } from "../assets/js/stats.js";

describe("workout mapping and statistics", () => {
  it("joins sets by session ID, retains category, and sorts newest first", () => {
    const sessions = [
      { session_id: "old", training_date: "2026-08-18", title: "Old", duration_minutes: "10" },
      { session_id: "new", training_date: "2026-08-20", title: "New", duration_minutes: "20" },
    ];
    const sets = [
      { session_id: "new", exercise_name: "Squat", exercise_category: "squat", set_order: "2", weight_kg: "110", reps: "3" },
      { session_id: "new", exercise_name: "Squat", exercise_category: "squat", set_order: "1", weight_kg: "100", reps: "5" },
    ];
    const workouts = mapSheetRecordsToWorkouts(sessions, sets);
    expect(workouts.map((workout) => workout.id)).toEqual(["new", "old"]);
    expect(workouts[0].exercises[0].category).toBe("squat");
    expect(workouts[0].exercises[0].sets.map((set) => set.weight)).toEqual([100, 110]);
  });

  it("generates statistics only from workout data", () => {
    const workouts = [{
      date: "2026-08-20",
      duration: 20,
      exercises: [{ name: "Squat", sets: [{ weight: 100, reps: 5 }] }],
    }];
    const statistics = createStatistics(workouts);
    expect(statistics.metrics).toEqual({ averageWorkoutDuration: 20, trainingCount: 1 });
    expect(statistics.charts.monthlyVolume.labels).toEqual(["2026-08"]);
    expect(statistics.charts.monthlyVolume.datasets[0].data).toEqual([500]);
    expect(statistics.charts.exerciseFrequency.datasets[0].data).toEqual([1]);
  });
});
