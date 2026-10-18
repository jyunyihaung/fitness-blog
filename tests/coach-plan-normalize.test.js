import { describe, expect, it } from "vitest";
import { normalizeCoachBlock1 } from "../assets/js/coach-plan-normalize.js";

function sampleRows() {
  const rows = Array.from({ length: 14 }, () => []);
  rows[0][1] = "Week1";
  rows[0][9] = "Week2";
  rows[0][17] = "Week3";
  rows[0][25] = "Week4";
  rows[1][0] = "Day1";
  rows[2] = ["Jump box", 3, 10, "BW", "", "", "", "", "30–45 cm"];
  rows[3] = ["Tempo Squat", 1, 3, "RPE4", "", "", "", "", "離心三秒"];
  rows[4] = ["KB Swing", 3, { raw: "2025-08-12", kind: "date_serial", excelSerial: "45881" },
    { raw: "2025-08-12", kind: "date_serial" }];
  rows[5] = ["Pause Bench", 3, 5, "RPE5", "50/50/45", 5, 5.5, "", "暫停一秒"];
  rows[6] = ["走路8000步", "8500+"];
  rows[7][1] = "休息日走路10000步";
  rows[8][0] = "Day2";
  rows[9] = ["Pull ups", 2, "Reps to rpe7", "BW"];
  rows[10][0] = "Day2跟Day3需間隔一天";
  rows[11][0] = "Day3";
  rows[12] = ["Hip internal rotation", 2, "8–12", "<20lbs"];
  rows[13] = ["收操(靜態伸展)", 1];
  return rows;
}

describe("coach Block1 normalization (Phase 0)", () => {
  it("keeps four weeks and marks empty later weeks without fabricating workouts", () => {
    const plan = normalizeCoachBlock1(sampleRows());
    expect(plan.format).toBe("fitness-blog-coach-plan");
    expect(plan.version).toBe(1);
    expect(plan.summary).toEqual({
      weekCount: 4,
      dayCount: 3,
      plannedWorkouts: 3,
      reviewCount: 2,
    });
    expect(plan.blocks[0].weeks.map((week) => week.status)).toEqual([
      "planned", "not_provided", "not_provided", "not_provided",
    ]);
    expect(plan.blocks[0].weeks[1].workouts.every((workout) =>
      workout.status === "not_provided" && workout.items.length === 0)).toBe(true);
  });

  it("preserves separate planned RPE and actual per-set weights / first/last RPE", () => {
    const plan = normalizeCoachBlock1(sampleRows());
    const bench = plan.blocks[0].weeks[0].workouts[0].items.find((x) => x.name === "Pause Bench");
    expect(bench.planned).toEqual({
      sets: 3,
      reps: { kind: "fixed", value: 5 },
      load: { kind: "rpe_target", rpe: 5 },
    });
    expect(bench.actual).toEqual({
      load: { kind: "per_set", valuesKg: [50, 50, 45] },
      firstRpe: 5,
      lastRpe: 5.5,
      record: "",
    });
    expect(bench.coachNotes).toBe("暫停一秒");
  });

  it("keeps BW, RPE-limited reps, ranges, bounded pounds and step activities distinctly", () => {
    const plan = normalizeCoachBlock1(sampleRows());
    const [day1, day2, day3] = plan.blocks[0].weeks[0].workouts;
    expect(day1.items[0].planned.load).toEqual({ kind: "bodyweight" });
    expect(day1.items.find((x) => x.kind === "activity").planned.target).toEqual({
      metric: "steps", minimum: 8500,
    });
    expect(day2.items[0].planned.reps).toEqual({ kind: "until_rpe", rpe: 7 });
    expect(day3.items[0].planned.reps).toEqual({ kind: "range", min: 8, max: 12 });
    expect(day3.items[0].planned.load).toEqual({
      kind: "bounded", operator: "<", value: 20, unit: "lbs",
    });
    expect(day3.items[1].kind).toBe("cooldown");
    expect(plan.blocks[0].weeks[0].notes).toEqual(expect.arrayContaining([
      "休息日走路10000步", "Day2跟Day3需間隔一天",
    ]));
  });

  it("flags Excel-encoded date values rather than guessing reps or weight", () => {
    const plan = normalizeCoachBlock1(sampleRows());
    const swing = plan.blocks[0].weeks[0].workouts[0].items.find((x) => x.name === "KB Swing");
    expect(swing.planned.reps).toEqual({ kind: "needs_review", raw: "2025-08-12" });
    expect(swing.planned.load).toEqual({ kind: "needs_review", raw: "2025-08-12" });
    expect(plan.issues.map((issue) => issue.code)).toEqual([
      "date_formatted_reps", "date_formatted_load",
    ]);
    expect(plan.issues.every((issue) => issue.severity === "review")).toBe(true);
  });

  it("rejects missing/duplicate structure safely", () => {
    expect(() => normalizeCoachBlock1([])).toThrow();
    expect(() => normalizeCoachBlock1([["Week1"], ["Test", 1]])).toThrow("缺少 Day");
    const bad = sampleRows();
    bad[0][9] = "Week1";
    expect(() => normalizeCoachBlock1(bad)).toThrow("重複");
  });

  it("retains source coordinates but never adds arbitrary workbook profile tabs", () => {
    const plan = normalizeCoachBlock1(sampleRows(), { sourceSheet: "Block1" });
    const workout = plan.blocks[0].weeks[0].workouts[0];
    expect(workout.items[0].source).toEqual({ sheet: "Block1", row: 3, week: 1, day: 1 });
    expect(plan).not.toHaveProperty("athlete");
    expect(plan.source).not.toHaveProperty("spreadsheetId");
  });
});
