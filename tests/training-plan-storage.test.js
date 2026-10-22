import { afterEach, describe, expect, it, vi } from "vitest";
import { HEADERS } from "../assets/js/google-sheets.js";
import { PLAN_HEADERS, createTrainingPlanRecords } from "../assets/js/training-plan-model.js";
import {
  buildPlanHeaderRepairData, buildTrainingPlanCreateRequests,
  createTrainingPlan, enableTrainingPlanStorage, getTrainingPlanRecords,
  listTrainingPlanRecords, updateTrainingPlanMetadata,
  updatePlannedWorkout, savePlannedExercise, deletePlannedExercise, replacePlannedDayExercises,
} from "../assets/js/training-plan-storage.js";

const ID = "training-plan-test";
const TOKEN = "unit-test-token";

function workbook() {
  let nextId = 6;
  const sheets = new Map(Object.entries(HEADERS).map(([name, headers], id) => [
    name, { id, rows: [headers] },
  ]));
  sheets.get("Schema").rows.push(
    ["app_id", "powerlifting-training-tracker"], ["schema_version", "1"],
  );
  const calls = [];
  const fetchMock = vi.fn(async (input, options = {}) => {
    const url = new URL(input);
    const path = decodeURIComponent(url.pathname);
    const method = options.method ?? "GET";
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ path, method, body });
    const json = (object) => ({ ok: true, status: 200, json: async () => object });
    if (method === "GET" && path.endsWith("/" + ID)) {
      return json({
        spreadsheetId: ID, properties: { title: "Training DB" },
        sheets: [...sheets.entries()].map(([title, s]) => ({
          properties: { title, sheetId: s.id },
        })),
      });
    }
    if (method === "GET" && path.endsWith("/values:batchGet")) {
      const ranges = url.searchParams.getAll("ranges");
      return json({ valueRanges: ranges.map((range) => {
        const name = range.split("!")[0];
        const sheet = sheets.get(name);
        if (!sheet) return { values: [] };
        const values = range.endsWith("!1:1") ? sheet.rows.slice(0, 1)
          : sheet.rows.map((r) => [...r]);
        return { values };
      }) });
    }
    if (method === "POST" && path.endsWith("/values:batchUpdate")) {
      for (const data of body.data) {
        const sheet = sheets.get(data.range.split("!")[0]);
        if (!sheet) throw new Error("unknown tab");
        if (data.range.endsWith("1")) {
          sheet.rows[0] ??= [];
          sheet.rows[0].push(...data.values[0]);
        }
        else throw new Error("unknown value range");
      }
      return json({});
    }
    if (method === "POST" && path.endsWith(":batchUpdate")) {
      for (const request of body.requests) {
        if (request.addSheet) {
          const title = request.addSheet.properties.title;
          sheets.set(title, { id: nextId++, rows: [] });
        }
        if (request.appendCells) {
          const sheet = [...sheets.values()].find((s) => s.id === request.appendCells.sheetId);
          if (!sheet) throw new Error("bad sheet id");
          request.appendCells.rows.forEach((r) => sheet.rows.push(r.values.map((v) => v.userEnteredValue.stringValue)));
        }
        if (request.updateCells) {
          const sheet = [...sheets.values()].find((s) => s.id === request.updateCells.range.sheetId);
          sheet.rows[request.updateCells.range.startRowIndex] =
            request.updateCells.rows[0].values.map((v) => v.userEnteredValue.stringValue);
        }
        if (request.deleteDimension) {
          const range = request.deleteDimension.range;
          const sheet = [...sheets.values()].find((s) => s.id === range.sheetId);
          sheet.rows.splice(range.startIndex, range.endIndex - range.startIndex);
        }
      }
      return json({});
    }
    throw new Error("Unexpected Google Sheets request: " + method + " " + url.href);
  });
  return { sheets, calls, fetchMock };
}

function sampleRecords() {
  const input = {
    format: "fitness-blog-coach-plan", version: 1, source: { sheet: "Block1" },
    blocks: [{ name: "Block1", weeks: [
      { week: 1, notes: [], workouts: [
        { day: 1, items: [{ name: "Pause Squat", kind: "exercise",
          planned: { sets: 2, reps: { kind: "fixed", value: 4 }, load: { kind: "rpe_target", rpe: 5 } },
          coachNotes: "1 sec", source: { row: 5 } }],
        }], },
    ] }],
  };
  let index = 0;
  return createTrainingPlanRecords(input, { idFactory: () => "id-" + ++index, title: "My Coach Plan" });
}

afterEach(() => vi.unstubAllGlobals());

describe("Training Plan Sheets storage (Phase 1)", () => {
  it("appends only missing columns, honoring shuffled header order", () => {
    const data = buildPlanHeaderRepairData({
      TrainingPlans: [["title", "plan_id"]],
      PlannedWorkouts: [[...PLAN_HEADERS.PlannedWorkouts]],
      PlannedSets: [[]],
    });
    expect(data).toHaveLength(2);
    expect(data[0].range).toBe("TrainingPlans!C1");
    expect(data[0].values[0]).not.toContain("title");
    expect(data[1]).toEqual({ range: "PlannedSets!A1", values: [PLAN_HEADERS.PlannedSets] });
  });

  it("builds a single transactional batch with actual header ordering", () => {
    const records = sampleRecords();
    const shuffled = [...PLAN_HEADERS.TrainingPlans].reverse();
    const requests = buildTrainingPlanCreateRequests(
      new Map([["TrainingPlans", 50], ["PlannedWorkouts", 51], ["PlannedSets", 52]]),
      { ...PLAN_HEADERS, TrainingPlans: shuffled }, records);
    expect(requests.map((r) => r.appendCells.sheetId)).toEqual([50, 51, 52]);
    expect(requests[0].appendCells.rows[0].values.map((cell) => cell.userEnteredValue.stringValue)[0])
      .toBe(records.plan.plan_schema_version);
    expect(requests[2].appendCells.rows).toHaveLength(1);
  });

  it("migrates old 6-tab v1 workbooks without touching Sessions/Sets and is idempotent", async () => {
    const state = workbook();
    vi.stubGlobal("fetch", state.fetchMock);
    const beforeSessions = JSON.stringify(state.sheets.get("Sessions").rows.slice(1));
    const beforeSets = JSON.stringify(state.sheets.get("Sets").rows.slice(1));
    const migrated = await enableTrainingPlanStorage(ID, TOKEN);
    expect(migrated.createdSheets).toEqual(["TrainingPlans", "PlannedWorkouts", "PlannedSets"]);
    expect(state.sheets.get("TrainingPlans").rows[0]).toEqual(PLAN_HEADERS.TrainingPlans);
    expect(state.sheets.get("PlannedWorkouts").rows[0]).toEqual(PLAN_HEADERS.PlannedWorkouts);
    expect(state.sheets.get("PlannedSets").rows[0]).toEqual(PLAN_HEADERS.PlannedSets);
    expect(state.sheets.get("Schema").rows).toContainEqual(["training_plan_schema_version", "1"]);
    expect(await listTrainingPlanRecords(ID, TOKEN)).toEqual({ plans: [], workouts: [], sets: [] });
    const again = await enableTrainingPlanStorage(ID, TOKEN);
    expect(again.createdSheets).toEqual([]);
    expect(again.repairedHeaders).toEqual([]);
    expect(state.sheets.get("Schema").rows.filter((r) => r[0] === "training_plan_schema_version")).toHaveLength(1);
    expect(state.sheets.get("Sessions").rows[0]).toEqual([...HEADERS.Sessions, "plan_id", "planned_workout_id"]);
    expect(state.sheets.get("Sets").rows[0]).toEqual([...HEADERS.Sets, "planned_set_id"]);
    expect(JSON.stringify(state.sheets.get("Sessions").rows.slice(1))).toBe(beforeSessions);
    expect(JSON.stringify(state.sheets.get("Sets").rows.slice(1))).toBe(beforeSets);
  });

  it("creates, reads and updates a plan without mutating planned sets or history", async () => {
    const state = workbook();
    vi.stubGlobal("fetch", state.fetchMock);
    await enableTrainingPlanStorage(ID, TOKEN);
    const records = sampleRecords();
    expect(await createTrainingPlan(ID, TOKEN, records)).toEqual({ planId: records.plan.plan_id });
    const loaded = await getTrainingPlanRecords(ID, TOKEN, records.plan.plan_id);
    expect(loaded.plan.title).toBe("My Coach Plan");
    expect(loaded.workouts).toHaveLength(1);
    expect(loaded.sets).toHaveLength(1);
    expect(loaded.sets[0]).toMatchObject({ reps_kind: "fixed", reps_value: "4", load_kind: "rpe_target", load_rpe: "5" });
    const before = JSON.stringify(state.sheets.get("PlannedSets").rows);
    const updated = await updateTrainingPlanMetadata(ID, TOKEN, records.plan.plan_id, {
      status: "active", title: "New Name",
    });
    expect(updated.status).toBe("active");
    expect((await getTrainingPlanRecords(ID, TOKEN, records.plan.plan_id)).plan.title).toBe("New Name");
    expect(JSON.stringify(state.sheets.get("PlannedSets").rows)).toBe(before);
    await expect(createTrainingPlan(ID, TOKEN, records)).rejects.toThrow("重複");
    await expect(updateTrainingPlanMetadata(ID, TOKEN, records.plan.plan_id, { plan_id: "other" })).rejects.toThrow("只允許");
    expect(state.sheets.get("Sessions").rows).toHaveLength(1);
    expect(state.sheets.get("Sets").rows).toHaveLength(1);
  });

  it("rejects an unsupported extension version before modifying user workbook", async () => {
    const state = workbook();
    state.sheets.get("Schema").rows.push(["training_plan_schema_version", "999"]);
    vi.stubGlobal("fetch", state.fetchMock);
    await expect(enableTrainingPlanStorage(ID, TOKEN)).rejects.toThrow("版本衝突");
    expect(state.sheets.size).toBe(6);
    expect(state.calls.every((call) => call.method === "GET")).toBe(true);
  });
});


describe("Training Plan editor persistence (Phase 2)", () => {
  it("gives actionable missing-tab errors without requesting absent ranges", async () => {
    const state = workbook();
    vi.stubGlobal("fetch", state.fetchMock);
    await expect(listTrainingPlanRecords(ID, TOKEN)).rejects.toThrow("尚未啟用訓練計畫");
    expect(state.calls.filter((call) => call.path.endsWith("/values:batchGet"))).toHaveLength(0);
  });

  it("changes a day's date/status without modifying completed history", async () => {
    const state = workbook();
    vi.stubGlobal("fetch", state.fetchMock);
    await enableTrainingPlanStorage(ID, TOKEN);
    const records = sampleRecords();
    await createTrainingPlan(ID, TOKEN, records);
    const beforeSessions = JSON.stringify(state.sheets.get("Sessions").rows);
    const workoutId = records.workouts[0].workout_id;
    await expect(updatePlannedWorkout(ID, TOKEN, workoutId, { status: "not_provided" }))
      .rejects.toThrow("移除");
    const updated = await updatePlannedWorkout(ID, TOKEN, workoutId, {
      title: "Squat Day", planned_date: "2026-10-22", notes: "Technique work",
    });
    expect(updated).toMatchObject({
      title: "Squat Day", planned_date: "2026-10-22", status: "planned",
    });
    expect((await getTrainingPlanRecords(ID, TOKEN, records.plan.plan_id)).workouts[0].title).toBe("Squat Day");
    expect(JSON.stringify(state.sheets.get("Sessions").rows)).toBe(beforeSessions);
  });

  it("creates, edits, rejects collision and deletes planned exercises safely", async () => {
    const state = workbook();
    vi.stubGlobal("fetch", state.fetchMock);
    await enableTrainingPlanStorage(ID, TOKEN);
    const records = sampleRecords();
    await createTrainingPlan(ID, TOKEN, records);
    const workoutId = records.workouts[0].workout_id;
    const newItem = {
      exercise_name: "Walk", exercise_order: "2", item_kind: "activity",
      target_sets: "", reps_kind: "unspecified", load_kind: "unspecified",
      target_metric: "steps", target_minimum: "8500", coach_notes: "Active recovery",
    };
    const created = await savePlannedExercise(ID, TOKEN, workoutId, newItem);
    expect(created).toMatchObject({ exercise_name: "Walk", target_minimum: "8500" });
    const read = await getTrainingPlanRecords(ID, TOKEN, records.plan.plan_id);
    expect(read.sets).toHaveLength(2);
    await expect(savePlannedExercise(ID, TOKEN, workoutId, {
      ...newItem, planned_set_id: created.planned_set_id, exercise_order: "1",
    })).rejects.toThrow("順序重複");
    const edited = await savePlannedExercise(ID, TOKEN, workoutId, {
      ...newItem, planned_set_id: created.planned_set_id, coach_notes: "Updated",
    });
    expect(edited.planned_set_id).toBe(created.planned_set_id);
    expect(edited.created_at).toBe(created.created_at);
    await deletePlannedExercise(ID, TOKEN, workoutId, created.planned_set_id);
    expect((await getTrainingPlanRecords(ID, TOKEN, records.plan.plan_id)).sets)
      .toHaveLength(1);
    expect(state.sheets.get("Sets").rows).toHaveLength(1);
    expect(state.sheets.get("Sessions").rows).toHaveLength(1);
  });

  it("prevents adding items to absent workouts or unrelated plan IDs", async () => {
    const state = workbook();
    vi.stubGlobal("fetch", state.fetchMock);
    await enableTrainingPlanStorage(ID, TOKEN);
    const normalized = {
      format: "fitness-blog-coach-plan", version: 1, source: { sheet: "Manual" },
      blocks: [{ name: "Custom", weeks: [{ week: 1, notes: [], workouts: [{ day: 1, items: [] }] }] }],
    };
    let index = 0;
    const plan = createTrainingPlanRecords(normalized, { idFactory: () => "blank-" + ++index });
    await createTrainingPlan(ID, TOKEN, plan);
    const workoutId = plan.workouts[0].workout_id;
    await expect(savePlannedExercise(ID, TOKEN, workoutId, {
      exercise_name: "Squat", exercise_order: "1", item_kind: "exercise",
      reps_kind: "fixed", reps_value: "5", load_kind: "bodyweight",
    })).rejects.toThrow("請先");
    await updatePlannedWorkout(ID, TOKEN, workoutId, { status: "planned" });
    await savePlannedExercise(ID, TOKEN, workoutId, {
      exercise_name: "Squat", exercise_order: "1", item_kind: "exercise",
      reps_kind: "fixed", reps_value: "5", load_kind: "bodyweight",
    });
    expect((await getTrainingPlanRecords(ID, TOKEN, plan.plan.plan_id)).sets).toHaveLength(1);
  });
});


describe("Automatic day status and multi-set atomic persistence", () => {
  it("saves multiple exercise groups and per-set targets in one batch", async () => {
    const state = workbook();
    vi.stubGlobal("fetch", state.fetchMock);
    await enableTrainingPlanStorage(ID, TOKEN);
    const original = sampleRecords();
    await createTrainingPlan(ID, TOKEN, original);
    const workoutId = original.workouts[0].workout_id;
    const beforeSessions = JSON.stringify(state.sheets.get("Sessions").rows);
    const beforeSets = JSON.stringify(state.sheets.get("Sets").rows);
    const result = await replacePlannedDayExercises(ID, TOKEN, workoutId, [
      { name: "Squat", category: "squat", planKind: "exercise", sets: [
        { repsKind: "fixed", reps: "5", loadKind: "fixed", weightKg: "50", loadUnit: "kg", type: "warmup", isWarmup: true },
        { repsKind: "fixed", reps: "3", loadKind: "fixed", weightKg: "80", loadUnit: "kg", type: "top" },
      ] },
      { name: "Pull Ups", category: "accessory", planKind: "exercise", sets: [
        { repsKind: "until_rpe", repsRpe: "7", loadKind: "bodyweight", type: "working" },
      ] },
    ]);
    expect(result).toMatchObject({ exerciseCount: 2, setCount: 3 });
    const loaded = await getTrainingPlanRecords(ID, TOKEN, original.plan.plan_id);
    expect(loaded.sets).toHaveLength(3);
    expect(loaded.sets.map((x) => x.load_kind)).toEqual(["fixed", "fixed", "bodyweight"]);
    expect(loaded.sets.map((x) => x.set_type)).toEqual(["warmup", "top", "working"]);
    expect(loaded.sets.map((x) => x.exercise_order)).toEqual(["1", "2", "3"]);
    expect(loaded.sets[0].exercise_group_id).toBe(loaded.sets[1].exercise_group_id);
    expect(loaded.workouts[0].status).toBe("planned");
    expect(JSON.stringify(state.sheets.get("Sessions").rows)).toBe(beforeSessions);
    expect(JSON.stringify(state.sheets.get("Sets").rows)).toBe(beforeSets);
    const writes = state.calls.filter((c) => c.method === "POST" && c.path.endsWith(":batchUpdate"));
    const last = writes.at(-1).body.requests;
    expect(last.filter((x) => x.deleteDimension)).toHaveLength(1);
    expect(last.filter((x) => x.appendCells)).toHaveLength(1);
    expect(last.filter((x) => x.updateCells)).toHaveLength(1);
  });

  it("automatically marks blank days as planned on first exercise and not_provided when cleared", async () => {
    const state = workbook();
    vi.stubGlobal("fetch", state.fetchMock);
    await enableTrainingPlanStorage(ID, TOKEN);
    let index = 0;
    const empty = createTrainingPlanRecords({
      format: "fitness-blog-coach-plan", version: 1, source: { sheet: "Manual" },
      blocks: [{ name: "Custom", weeks: [{ week: 1, notes: [], workouts: [{ day: 1, items: [] }] }] }],
    }, { idFactory: () => "empty-" + ++index });
    await createTrainingPlan(ID, TOKEN, empty);
    const workoutId = empty.workouts[0].workout_id;
    await replacePlannedDayExercises(ID, TOKEN, workoutId, [{
      name: "Squat", category: "squat", planKind: "exercise",
      sets: [{ repsKind: "fixed", reps: "3", loadKind: "fixed", weightKg: "70", loadUnit: "kg", type: "working" }],
    }]);
    expect((await getTrainingPlanRecords(ID, TOKEN, empty.plan.plan_id)).workouts[0].status).toBe("planned");
    await replacePlannedDayExercises(ID, TOKEN, workoutId, []);
    const loaded = await getTrainingPlanRecords(ID, TOKEN, empty.plan.plan_id);
    expect(loaded.workouts[0].status).toBe("not_provided");
    expect(loaded.sets).toEqual([]);
  });

  it("rejects an invalid editor submission without deleting any original prescription", async () => {
    const state = workbook();
    vi.stubGlobal("fetch", state.fetchMock);
    await enableTrainingPlanStorage(ID, TOKEN);
    const original = sampleRecords();
    await createTrainingPlan(ID, TOKEN, original);
    const target = original.workouts[0].workout_id;
    const before = JSON.stringify(state.sheets.get("PlannedSets").rows);
    await expect(replacePlannedDayExercises(ID, TOKEN, target, [{
      name: "Squat", category: "squat", planKind: "exercise",
      sets: [{ repsKind: "fixed", reps: "", loadKind: "fixed", weightKg: "50", loadUnit: "kg", type: "working" }],
    }])).rejects.toThrow("目標次數");
    expect(JSON.stringify(state.sheets.get("PlannedSets").rows)).toBe(before);
  });
});
