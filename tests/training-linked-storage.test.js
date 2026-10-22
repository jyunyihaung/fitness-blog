import { afterEach, describe, expect, it, vi } from "vitest";
import { HEADERS, appendLinkedWorkoutRecord } from "../assets/js/google-sheets.js";

const SHEET = "linked-training-test";
const TOKEN = "synthetic-token";
const record = (id = "session-one") => ({
  session: {
    session_id: id, plan_id: "plan-a", planned_workout_id: "day-1",
    training_date: "2026-10-22", title: "Week 1 Day 1", schema_version: "1",
    started_at: "2026-10-22T06:00:00Z", ended_at: "2026-10-22T07:00:00Z",
  },
  sets: [{
    set_id: "actual-set", session_id: id, exercise_name: "Squat", exercise_category: "squat",
    set_order: "1", weight_kg: "60", reps: "4", rpe: "6", is_warmup: "false",
    set_type: "working", notes: "", planned_set_id: "planned-set",
  }],
});

function fakeWorkbook({ includeLinks = true } = {}) {
  const headings = includeLinks
    ? {
      Sessions: [...HEADERS.Sessions, "plan_id", "planned_workout_id"],
      Sets: [...HEADERS.Sets, "planned_set_id"],
    }
    : { Sessions: [...HEADERS.Sessions], Sets: [...HEADERS.Sets] };
  const tables = new Map(Object.entries(headings).map(([name, cols], i) => [name, {
    id: i, rows: [cols],
  }]));
  const writes = [];
  const handler = vi.fn(async (url, options = {}) => {
    const path = new URL(url).pathname;
    const get = (value) => ({ ok: true, status: 200, json: async () => value });
    if ((options.method ?? "GET") === "GET" && path.endsWith("/" + SHEET)) {
      return get({ sheets: [...tables.entries()].map(([title, sheet]) =>
        ({ properties: { title, sheetId: sheet.id } })) });
    }
    if (path.endsWith("/values:batchGet")) {
      const ranges = new URL(url).searchParams.getAll("ranges");
      return get({ valueRanges: ranges.map((range) => ({
        values: tables.get(range.split("!")[0]).rows
          .slice(0, range.endsWith("!1:1") ? 1 : undefined),
      })) });
    }
    if (path.endsWith(":batchUpdate") && options.method === "POST") {
      const requests = JSON.parse(options.body).requests;
      writes.push(requests);
      for (const request of requests) {
        const table = [...tables.values()].find((t) => t.id === request.appendCells.sheetId);
        for (const row of request.appendCells.rows) {
          table.rows.push(row.values.map(v => v.userEnteredValue.stringValue));
        }
      }
      return get({});
    }
    throw new Error("Unexpected Sheets request " + path);
  });
  return { tables, writes, handler };
}

afterEach(() => vi.unstubAllGlobals());

describe("Linked actual workout Sheets append (Phase 3)", () => {
  it("appends one session and set, and safely deduplicates a retry with the same ID", async () => {
    const state = fakeWorkbook();
    vi.stubGlobal("fetch", state.handler);
    const first = await appendLinkedWorkoutRecord(SHEET, TOKEN, record());
    expect(first).toEqual({ sessionId: "session-one", alreadyExists: false });
    expect(state.writes).toHaveLength(1);
    const sessions = state.tables.get("Sessions").rows;
    const actualSets = state.tables.get("Sets").rows;
    expect(sessions).toHaveLength(2);
    expect(actualSets).toHaveLength(2);
    expect(sessions[1][sessions[0].indexOf("plan_id")]).toBe("plan-a");
    expect(sessions[1][sessions[0].indexOf("planned_workout_id")]).toBe("day-1");
    expect(actualSets[1][actualSets[0].indexOf("planned_set_id")]).toBe("planned-set");
    const retry = await appendLinkedWorkoutRecord(SHEET, TOKEN, record());
    expect(retry).toEqual({ sessionId: "session-one", alreadyExists: true });
    expect(state.writes).toHaveLength(1);
  });

  it("rejects missing linkage headers without modifying original Sessions/Sets", async () => {
    const state = fakeWorkbook({ includeLinks: false });
    vi.stubGlobal("fetch", state.handler);
    await expect(appendLinkedWorkoutRecord(SHEET, TOKEN, record()))
      .rejects.toThrow("關聯欄位");
    expect(state.writes).toHaveLength(0);
    expect(state.tables.get("Sessions").rows).toHaveLength(1);
  });

  it("fails closed on mismatched set IDs and reused session ID from another plan", async () => {
    const state = fakeWorkbook();
    vi.stubGlobal("fetch", state.handler);
    const wrongSet = record();
    wrongSet.sets[0].session_id = "another";
    await expect(appendLinkedWorkoutRecord(SHEET, TOKEN, wrongSet))
      .rejects.toThrow("不一致");
    await appendLinkedWorkoutRecord(SHEET, TOKEN, record());
    const wrongPlan = record();
    wrongPlan.session.plan_id = "other";
    await expect(appendLinkedWorkoutRecord(SHEET, TOKEN, wrongPlan))
      .rejects.toThrow("其他課表");
    expect(state.writes).toHaveLength(1);
  });
});
