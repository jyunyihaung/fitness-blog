import { describe, expect, it } from "vitest";
import { buildGoalUpsertRequests, buildWorkoutAppendRequests } from "../assets/js/google-sheets.js";

describe("Google Sheets request builders", () => {
  it("maps workout values using the actual header order", () => {
    const requests = buildWorkoutAppendRequests(
      new Map([["Sessions", 10], ["Sets", 20]]),
      ["title", "session_id"],
      ["weight_kg", "session_id"],
      {
        session: { session_id: "session-1", title: "Squat" },
        sets: [{ session_id: "session-1", weight_kg: "100" }],
      },
    );
    expect(requests[0].appendCells.sheetId).toBe(10);
    expect(requests[0].appendCells.rows[0].values.map((cell) => cell.userEnteredValue.stringValue)).toEqual(["Squat", "session-1"]);
    expect(requests[1].appendCells.rows[0].values.map((cell) => cell.userEnteredValue.stringValue)).toEqual(["100", "session-1"]);
  });

  it("updates an existing lift and appends a new lift", () => {
    const headers = ["goal_id", "lift", "target_weight_kg"];
    const requests = buildGoalUpsertRequests(30, headers, [
      { rowIndex: 1, record: { goal_id: "squat-id", lift: "squat" } },
    ], [
      { goal_id: "squat-id", lift: "squat", target_weight_kg: "120" },
      { goal_id: "bench-id", lift: "bench", target_weight_kg: "100" },
    ]);
    expect(requests[0].updateCells.range).toEqual(expect.objectContaining({ sheetId: 30, startRowIndex: 1, endRowIndex: 2 }));
    expect(requests[1].appendCells.sheetId).toBe(30);
  });
});
