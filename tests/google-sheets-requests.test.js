import { describe, expect, it } from "vitest";
import {
  buildGoalUpsertRequests,
  buildExerciseUpsertRequest,
  buildHeaderRepairData,
  buildSettingUpsertRequests,
  buildWorkoutAppendRequests,
  buildWorkoutDeleteRequests,
  buildWorkoutReplaceRequests,
} from "../assets/js/google-sheets.js";

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

  it("deletes set rows from bottom to top before deleting the session", () => {
    const requests = buildWorkoutDeleteRequests(new Map([["Sessions", 10], ["Sets", 20]]), 3, [2, 5, 4]);
    expect(requests.map((request) => request.deleteDimension.range)).toEqual([
      expect.objectContaining({ sheetId: 20, startIndex: 5 }),
      expect.objectContaining({ sheetId: 20, startIndex: 4 }),
      expect.objectContaining({ sheetId: 20, startIndex: 2 }),
      expect.objectContaining({ sheetId: 10, startIndex: 3 }),
    ]);
  });

  it("replaces a workout by deleting old sets, updating its session, and appending new sets", () => {
    const requests = buildWorkoutReplaceRequests(
      new Map([["Sessions", 10], ["Sets", 20]]),
      ["session_id", "title"],
      ["session_id", "weight_kg"],
      2,
      [3],
      { session: { session_id: "s1", title: "Edited" }, sets: [{ session_id: "s1", weight_kg: "80" }] },
    );
    expect(requests[0].deleteDimension.range).toEqual(expect.objectContaining({ sheetId: 20, startIndex: 3 }));
    expect(requests[1].updateCells.range).toEqual(expect.objectContaining({ sheetId: 10, startRowIndex: 2 }));
    expect(requests[2].appendCells.rows[0].values.map((cell) => cell.userEnteredValue.stringValue)).toEqual(["s1", "80"]);
  });

  it("appends only missing schema headers without reordering existing columns", () => {
    const rows = [
      [["title", "session_id"]],
      [["set_id", "session_id"]],
      [["goal_id"]],
      [["value", "key"]],
      [["value", "key"]],
      [["exercise_name", "exercise_id"]],
    ];
    const repairs = buildHeaderRepairData(rows);
    expect(repairs[0].range).toBe("Sessions!C1");
    expect(repairs[0].values[0]).not.toContain("session_id");
    expect(repairs[3]).toEqual({ range: "Settings!C1", values: [["updated_at"]] });
  });

  it("updates existing settings by key and appends missing settings", () => {
    const requests = buildSettingUpsertRequests(40, ["value", "key", "updated_at"], [
      { rowIndex: 2, record: { key: "theme", value: "system" } },
    ], [
      { key: "theme", value: "dark", updated_at: "now" },
      { key: "locale", value: "zh-TW", updated_at: "now" },
    ]);
    expect(requests[0].updateCells.range).toEqual(expect.objectContaining({ sheetId: 40, startRowIndex: 2 }));
    expect(requests[0].updateCells.rows[0].values.map((cell) => cell.userEnteredValue.stringValue)).toEqual(["dark", "theme", "now"]);
    expect(requests[1].appendCells.sheetId).toBe(40);
  });

  it("maps Exercise updates and appends using named header order", () => {
    const headers = ["exercise_name", "exercise_id", "is_active"];
    const record = { exercise_id: "squat", exercise_name: "Squat", is_active: "false" };
    const update = buildExerciseUpsertRequest(50, headers, { rowIndex: 3 }, record);
    expect(update.updateCells.range).toEqual(expect.objectContaining({ sheetId: 50, startRowIndex: 3 }));
    expect(update.updateCells.rows[0].values.map((cell) => cell.userEnteredValue.stringValue)).toEqual(["Squat", "squat", "false"]);
    expect(buildExerciseUpsertRequest(50, headers, null, record).appendCells.sheetId).toBe(50);
  });
});
