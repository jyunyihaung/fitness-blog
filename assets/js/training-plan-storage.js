// Phase 1: opt-in, additive Training Plan sheets next to the unchanged v1 records.
// No completed Sessions/Sets are created from prescriptions.
import { readRanges, validateSpreadsheet } from "./google-sheets.js";
import { PLAN_HEADERS, PLAN_TITLES, PLAN_SCHEMA_VERSION, validateTrainingPlanRecords } from "./training-plan-model.js";
import { exercisesToPlannedRows, validatePlannedDayReplacement } from "./training-plan-editor.js";
import { buildExecutionHeaderRepairs } from "./training-session-domain.js";

const API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const VERSION_KEY = "training_plan_schema_version";

async function sheetsRequest(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (response.ok) return response.status === 204 ? null : response.json();
  // Never show unsanitized Google API responses or credentials to the user.
  throw new Error(response.status === 401 || response.status === 403
    ? "Google 授權失敗，請重新連線後再試。"
    : "Google Sheets 訓練計畫操作失敗（HTTP " + response.status + "）。");
}

function sheetIdsFromMetadata(metadata) {
  return new Map((metadata.sheets ?? []).map((s) => [
    s.properties?.title, s.properties?.sheetId,
  ]));
}

function readSheetRows(values) {
  const headers = (values[0] ?? []).map((h) => String(h).trim());
  if (headers.length !== new Set(headers).size) throw new Error("Google Sheet 欄位名稱重複，請先修正。");
  return {
    headers,
    rows: values.slice(1).map((row, index) => ({
      rowIndex: index + 1, record: Object.fromEntries(headers.map((h, i) => [h, String(row[i] ?? "").trim()])),
    })).filter(({ record }) => Object.values(record).some(Boolean)),
  };
}

function requirePlanHeaders(title, rows) {
  const missing = PLAN_HEADERS[title].filter((column) => !rows.headers.includes(column));
  if (missing.length) throw new Error(title + " 缺少欄位：" + missing.join(", "));
}

function columnName(index) {
  let name = "";
  for (let i = index; i > 0; i = Math.floor((i - 1) / 26)) {
    name = String.fromCharCode(65 + (i - 1) % 26) + name;
  }
  return name;
}

export function buildPlanHeaderRepairData(rowsByTitle) {
  return PLAN_TITLES.flatMap((title) => {
    const headers = (rowsByTitle[title]?.[0] ?? []).map((h) => String(h).trim());
    if (headers.length !== new Set(headers).size) throw new Error(title + " 欄位名稱重複。");
    const missing = PLAN_HEADERS[title].filter((h) => !headers.includes(h));
    return missing.length ? [{ range: title + "!" + columnName(headers.length + 1) + "1", values: [missing] }] : [];
  });
}

function appendRow(headers, record) {
  return { values: headers.map((header) => ({
    userEnteredValue: { stringValue: String(record[header] ?? "") },
  })) };
}

export function buildTrainingPlanCreateRequests(sheetIds, headersByTitle, records) {
  validateTrainingPlanRecords(records);
  const data = [
    ["TrainingPlans", [records.plan]],
    ["PlannedWorkouts", records.workouts],
    ["PlannedSets", records.sets],
  ];
  return data.filter(([, rows]) => rows.length).map(([title, rows]) => {
    const id = sheetIds.get(title);
    if (!Number.isInteger(id)) throw new Error(title + " 工作表不存在。");
    const headers = headersByTitle[title];
    if (!headers || PLAN_HEADERS[title].some((name) => !headers.includes(name))) {
      throw new Error(title + " 缺少必要欄位。");
    }
    return { appendCells: {
      sheetId: id, rows: rows.map((record) => appendRow(headers, record)),
      fields: "userEnteredValue",
    } };
  });
}

export function buildTrainingPlanMetadataUpdateRequest(sheetId, headers, rowIndex, record) {
  if (!Number.isInteger(sheetId) || !Number.isInteger(rowIndex) || rowIndex < 1) {
    throw new Error("訓練計畫不存在，無法更新。");
  }
  return { updateCells: {
    range: {
      sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1,
      startColumnIndex: 0, endColumnIndex: headers.length,
    },
    rows: [appendRow(headers, record)],
    fields: "userEnteredValue",
  } };
}

async function planReadContext(spreadsheetId, token) {
  const baseUrl = API_BASE + "/" + encodeURIComponent(spreadsheetId);
  const metadata = await sheetsRequest(baseUrl + "?fields=" +
    encodeURIComponent("sheets.properties(sheetId,title)"), token);
  const sheetIds = sheetIdsFromMetadata(metadata);
  for (const title of PLAN_TITLES) {
    if (!Number.isInteger(sheetIds.get(title))) throw new Error("尚未啟用訓練計畫：" + title + " 不存在。");
  }
  const valuesByRange = await readRanges(spreadsheetId, token, [...PLAN_TITLES, "Schema!A:B"]);
  const rowsByTitle = Object.fromEntries(PLAN_TITLES.map((title, i) =>
    [title, readSheetRows(valuesByRange[i] ?? [])]));
  for (const title of PLAN_TITLES) {
    requirePlanHeaders(title, rowsByTitle[title]);
  }
  const schema = readSheetRows(valuesByRange[PLAN_TITLES.length] ?? []);
  if (schema.rows.find((r) => r.record.key === VERSION_KEY)?.record.value !== PLAN_SCHEMA_VERSION) {
    throw new Error("尚未完成訓練計畫資料表的版本初始化。");
  }
  return { baseUrl, sheetIds, rowsByTitle };
}

// Explicitly triggered by the Settings page; existing v1 workbooks remain valid.
// This creates missing tabs and appends missing columns without deleting data.
export async function enableTrainingPlanStorage(spreadsheetId, token) {
  await validateSpreadsheet(spreadsheetId, token);
  const baseUrl = API_BASE + "/" + encodeURIComponent(spreadsheetId);
  const metadataUrl = baseUrl + "?fields=" + encodeURIComponent("sheets.properties(sheetId,title)");
  let metadata = await sheetsRequest(metadataUrl, token);
  const existing = sheetIdsFromMetadata(metadata);
  const missing = PLAN_TITLES.filter((title) => !existing.has(title));
  const [schemaValues] = await readRanges(spreadsheetId, token, ["Schema!A:B"]);
  const schema = readSheetRows(schemaValues ?? []);
  const rows = schema.rows.filter((r) => r.record.key === VERSION_KEY);
  if (rows.length > 1 || (rows.length && rows[0].record.value !== PLAN_SCHEMA_VERSION)) {
    throw new Error("訓練計畫版本衝突，拒絕進行自動遷移。");
  }
  if (missing.length) {
    await sheetsRequest(baseUrl + ":batchUpdate", token, {
      method: "POST", body: JSON.stringify({
        requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
      }),
    });
    metadata = await sheetsRequest(metadataUrl, token);
  }
  const sheetIds = sheetIdsFromMetadata(metadata);
  const headerRows = await readRanges(spreadsheetId, token, PLAN_TITLES.map((t) => t + "!1:1"));
  const byTitle = Object.fromEntries(PLAN_TITLES.map((title, i) => [title, headerRows[i] ?? []]));
  const repairs = buildPlanHeaderRepairData(byTitle);
  if (repairs.length) {
    await sheetsRequest(baseUrl + "/values:batchUpdate", token, {
      method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data: repairs }),
    });
  }
  // Phase 3 optional links are added when the user confirms the existing
  // "enable plan storage" action. No legacy Sessions/Sets rows are rewritten.
  const linkHeaders = await readRanges(spreadsheetId, token, ["Sessions!1:1", "Sets!1:1"]);
  const linkRepairs = buildExecutionHeaderRepairs({
    Sessions: linkHeaders[0]?.[0] ?? [],
    Sets: linkHeaders[1]?.[0] ?? [],
  });
  if (linkRepairs.length) {
    await sheetsRequest(baseUrl + "/values:batchUpdate", token, {
      method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data: linkRepairs }),
    });
  }
  if (!rows.length) {
    const schemaHeaders = schema.headers;
    if (!schemaHeaders.includes("key") || !schemaHeaders.includes("value")) {
      throw new Error("Schema 工作表缺少 key 或 value 欄位。");
    }
    await sheetsRequest(baseUrl + ":batchUpdate", token, {
      method: "POST", body: JSON.stringify({ requests: [{
        appendCells: {
          sheetId: sheetIds.get("Schema"),
          rows: [appendRow(schemaHeaders, { key: VERSION_KEY, value: PLAN_SCHEMA_VERSION })],
          fields: "userEnteredValue",
        },
      }] }),
    });
  }
  await planReadContext(spreadsheetId, token);
  return { createdSheets: missing, repairedHeaders: [...repairs, ...linkRepairs].map((item) => item.range), version: PLAN_SCHEMA_VERSION };
}

// Read-only. Does not auto-create tabs or migrate existing user workbooks.
export async function listTrainingPlanRecords(spreadsheetId, token) {
  const { rowsByTitle } = await planReadContext(spreadsheetId, token);
  return {
    plans: rowsByTitle.TrainingPlans.rows.map((r) => r.record),
    workouts: rowsByTitle.PlannedWorkouts.rows.map((r) => r.record),
    sets: rowsByTitle.PlannedSets.rows.map((r) => r.record),
  };
}

export async function getTrainingPlanRecords(spreadsheetId, token, planId) {
  const all = await listTrainingPlanRecords(spreadsheetId, token);
  const plan = all.plans.find((p) => p.plan_id === planId);
  if (!plan) return null;
  const workouts = all.workouts.filter((w) => w.plan_id === planId);
  const ids = new Set(workouts.map((w) => w.workout_id));
  return { plan, workouts, sets: all.sets.filter((item) => ids.has(item.workout_id)) };
}

export async function createTrainingPlan(spreadsheetId, token, records) {
  validateTrainingPlanRecords(records);
  const { baseUrl, sheetIds, rowsByTitle } = await planReadContext(spreadsheetId, token);
  if (rowsByTitle.TrainingPlans.rows.some((row) => row.record.plan_id === records.plan.plan_id)) {
    throw new Error("計畫 ID 已存在，請避免重複匯入。");
  }
  for (const [title, key, newIds] of [
    ["PlannedWorkouts", "workout_id", records.workouts.map((w) => w.workout_id)],
    ["PlannedSets", "planned_set_id", records.sets.map((s) => s.planned_set_id)],
  ]) {
    const existing = new Set(rowsByTitle[title].rows.map((r) => r.record[key]));
    if (newIds.some((id) => existing.has(id))) throw new Error(title + " 包含重複 ID。");
  }
  const requests = buildTrainingPlanCreateRequests(sheetIds,
    Object.fromEntries(PLAN_TITLES.map((t) => [t, rowsByTitle[t].headers])), records);
  await sheetsRequest(baseUrl + ":batchUpdate", token, {
    method: "POST", body: JSON.stringify({ requests }),
  });
  return { planId: records.plan.plan_id };
}

// Metadata changes only, preserving workout IDs and all planned set rows.
export async function updateTrainingPlanMetadata(spreadsheetId, token, planId, updates) {
  const allowedKeys = new Set(["title", "status", "notes"]);
  if (!updates || !Object.keys(updates).length || Object.keys(updates).some((key) => !allowedKeys.has(key))) {
    throw new Error("只允許更新課表名稱、狀態和備註。");
  }
  const { baseUrl, sheetIds, rowsByTitle } = await planReadContext(spreadsheetId, token);
  const target = rowsByTitle.TrainingPlans.rows.find((r) => r.record.plan_id === planId);
  if (!target) throw new Error("找不到要更新的訓練計畫。");
  const result = { ...target.record, ...updates, updated_at: new Date().toISOString() };
  if (!String(result.title).trim() || !["draft", "active", "archived"].includes(result.status)) {
    throw new Error("課表名稱或狀態不合法。");
  }
  const request = buildTrainingPlanMetadataUpdateRequest(
    sheetIds.get("TrainingPlans"), rowsByTitle.TrainingPlans.headers, target.rowIndex, result);
  await sheetsRequest(baseUrl + ":batchUpdate", token, {
    method: "POST", body: JSON.stringify({ requests: [request] }),
  });
  return result;
}


// Phase 2: edits are scoped by immutable plan/workout/item IDs, never a cached row
// index. The full plan is validated before each write; unrelated plans are ignored.
export async function updatePlannedWorkout(spreadsheetId, token, workoutId, updates) {
  const allowed = ["title", "status", "planned_date", "notes"];
  if (!updates || !Object.keys(updates).length ||
      Object.keys(updates).some((key) => !allowed.includes(key))) {
    throw new Error("只允許更新訓練日的名稱、狀態、日期和備註。");
  }
  const { baseUrl, sheetIds, rowsByTitle } = await planReadContext(spreadsheetId, token);
  const existing = rowsByTitle.PlannedWorkouts.rows.find((w) => w.record.workout_id === workoutId);
  if (!existing) throw new Error("找不到訓練日。");
  const record = { ...existing.record, ...updates, updated_at: new Date().toISOString() };
  if (!String(record.title).trim() || !["planned", "not_provided"].includes(record.status)) {
    throw new Error("訓練日名稱或狀態不正確。");
  }
  if (record.planned_date && !/^\d{4}-\d{2}-\d{2}$/.test(record.planned_date)) {
    throw new Error("日期格式不正確。");
  }
  if (record.status === "not_provided" &&
      rowsByTitle.PlannedSets.rows.some((s) => s.record.workout_id === workoutId)) {
    throw new Error("請先移除訓練日中的處方，再將狀態改成尚未提供。");
  }
  const request = buildTrainingPlanMetadataUpdateRequest(
    sheetIds.get("PlannedWorkouts"), rowsByTitle.PlannedWorkouts.headers,
    existing.rowIndex, record,
  );
  await sheetsRequest(baseUrl + ":batchUpdate", token, {
    method: "POST", body: JSON.stringify({ requests: [request] }),
  });
  return record;
}

export async function savePlannedExercise(spreadsheetId, token, workoutId, input) {
  if (!input || typeof input !== "object") throw new Error("缺少動作內容。");
  const { baseUrl, sheetIds, rowsByTitle } = await planReadContext(spreadsheetId, token);
  const workout = rowsByTitle.PlannedWorkouts.rows.find((w) => w.record.workout_id === workoutId)?.record;
  if (!workout) throw new Error("找不到訓練日。");
  if (workout.status !== "planned") throw new Error("請先將訓練日狀態設為已有訓練內容。");
  const plan = rowsByTitle.TrainingPlans.rows.find((p) => p.record.plan_id === workout.plan_id)?.record;
  if (!plan) throw new Error("找不到此訓練日所屬的計畫。");

  const existing = input.planned_set_id
    ? rowsByTitle.PlannedSets.rows.find((s) => s.record.planned_set_id === input.planned_set_id)
    : null;
  if (input.planned_set_id && (!existing || existing.record.workout_id !== workoutId)) {
    throw new Error("找不到要編輯的處方。");
  }
  const now = new Date().toISOString();
  const record = {
    ...(existing?.record ?? {}),
    ...Object.fromEntries(PLAN_HEADERS.PlannedSets.map((key) => [key, input[key] ?? existing?.record[key] ?? ""])),
    planned_set_id: existing?.record.planned_set_id ?? crypto.randomUUID(),
    workout_id: workoutId,
    created_at: existing?.record.created_at ?? now,
    updated_at: now,
  };

  const workouts = rowsByTitle.PlannedWorkouts.rows
    .map((w) => w.record).filter((w) => w.plan_id === plan.plan_id);
  const workoutIds = new Set(workouts.map((w) => w.workout_id));
  const allItems = rowsByTitle.PlannedSets.rows
    .map((s) => s.record).filter((s) => workoutIds.has(s.workout_id));
  const candidate = {
    plan, workouts,
    sets: [
      ...allItems.filter((s) => s.planned_set_id !== record.planned_set_id),
      record,
    ],
  };
  validateTrainingPlanRecords(candidate);

  const sheetId = sheetIds.get("PlannedSets");
  const headers = rowsByTitle.PlannedSets.headers;
  const request = existing
    ? buildTrainingPlanMetadataUpdateRequest(sheetId, headers, existing.rowIndex, record)
    : { appendCells: { sheetId, rows: [appendRow(headers, record)], fields: "userEnteredValue" } };
  await sheetsRequest(baseUrl + ":batchUpdate", token, {
    method: "POST", body: JSON.stringify({ requests: [request] }),
  });
  return record;
}

export async function deletePlannedExercise(spreadsheetId, token, workoutId, plannedSetId) {
  const { baseUrl, sheetIds, rowsByTitle } = await planReadContext(spreadsheetId, token);
  if (!rowsByTitle.PlannedWorkouts.rows.some((w) => w.record.workout_id === workoutId)) {
    throw new Error("找不到訓練日。");
  }
  const existing = rowsByTitle.PlannedSets.rows.find((s) =>
    s.record.planned_set_id === plannedSetId && s.record.workout_id === workoutId);
  if (!existing) throw new Error("找不到要刪除的動作。");
  await sheetsRequest(baseUrl + ":batchUpdate", token, {
    method: "POST", body: JSON.stringify({ requests: [{
      deleteDimension: {
        range: {
          sheetId: sheetIds.get("PlannedSets"),
          dimension: "ROWS", startIndex: existing.rowIndex, endIndex: existing.rowIndex + 1,
        },
      },
    }] }),
  });
}


// Replace an entire day in one atomic Google Sheets batch. Exercise rows are
// ordered and grouped so warm-up/top/backoff sets can differ in weight/reps/RPE.
// Blank -> planned when an exercise is added, planned -> blank when all removed.
export async function replacePlannedDayExercises(spreadsheetId, token, workoutId, exercises) {
  const { baseUrl, sheetIds, rowsByTitle } = await planReadContext(spreadsheetId, token);
  const existingWorkout = rowsByTitle.PlannedWorkouts.rows.find((row) => row.record.workout_id === workoutId);
  if (!existingWorkout) throw new Error("找不到指定的訓練日。");
  const planId = existingWorkout.record.plan_id;
  const plan = rowsByTitle.TrainingPlans.rows.find((row) => row.record.plan_id === planId)?.record;
  if (!plan) throw new Error("找不到指定的訓練計畫。");
  const workouts = rowsByTitle.PlannedWorkouts.rows.filter((row) =>
    row.record.plan_id === planId).map((row) => row.record);
  const workoutIds = new Set(workouts.map((row) => row.workout_id));
  const previous = rowsByTitle.PlannedSets.rows.filter((row) =>
    workoutIds.has(row.record.workout_id)).map((row) => row.record);
  const next = exercisesToPlannedRows(workoutId, exercises);
  validatePlannedDayReplacement(plan, workouts, previous, workoutId, next);

  // Fail closed instead of discarding columns added by other tools.
  for (const title of ["PlannedSets", "PlannedWorkouts"]) {
    const unknown = rowsByTitle[title].headers.filter((header) => !PLAN_HEADERS[title].includes(header));
    if (unknown.length) {
      throw new Error(title + " 含有未支援的自訂欄位，為避免覆蓋資料請先備份並確認。");
    }
  }
  const planSetId = sheetIds.get("PlannedSets");
  const headers = rowsByTitle.PlannedSets.headers;
  const oldRows = rowsByTitle.PlannedSets.rows.filter((row) => row.record.workout_id === workoutId);
  const requests = oldRows.sort((a,b) => b.rowIndex-a.rowIndex).map(({ rowIndex }) => ({
    deleteDimension: { range: { sheetId: planSetId, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 } },
  }));
  if (next.length) requests.push({
    appendCells: { sheetId: planSetId, rows: next.map((item) => appendRow(headers, item)), fields: "userEnteredValue" },
  });
  requests.push(buildTrainingPlanMetadataUpdateRequest(
    sheetIds.get("PlannedWorkouts"), rowsByTitle.PlannedWorkouts.headers, existingWorkout.rowIndex,
    { ...existingWorkout.record, status: next.length ? "planned" : "not_provided", updated_at: new Date().toISOString() },
  ));
  await sheetsRequest(baseUrl + ":batchUpdate", token, { method: "POST", body: JSON.stringify({ requests }) });
  return { workoutId, exerciseCount: exercises.length, setCount: next.length };
}
