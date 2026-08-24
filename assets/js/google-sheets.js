import { googleApiError, schemaError } from "./app-error.js";

const API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const PICKER_SRC = "https://apis.google.com/js/api.js";
const SHEET_TITLES = ["Sessions", "Sets", "Goals", "Settings", "Schema", "Exercises"];

const HEADERS = {
  Sessions: ["session_id", "started_at", "ended_at", "training_date", "title", "body_weight_kg", "duration_minutes", "notes", "created_at", "updated_at", "schema_version"],
  Sets: ["set_id", "session_id", "exercise_name", "exercise_category", "set_order", "weight_kg", "reps", "rpe", "is_warmup", "set_type", "notes", "created_at", "updated_at"],
  Goals: ["goal_id", "lift", "target_weight_kg", "current_weight_kg", "target_date", "notes", "updated_at"],
  Settings: ["key", "value", "updated_at"],
  Schema: ["key", "value"],
  Exercises: ["exercise_id", "exercise_name", "category", "is_default", "is_active", "last_used_at", "created_at"],
};

const DEFAULT_EXERCISES = [
  ["squat", "Squat", "squat"],
  ["bench-press", "Bench Press", "bench"],
  ["deadlift", "Deadlift", "deadlift"],
  ["paused-squat", "Paused Squat", "squat"],
  ["close-grip-bench-press", "Close-Grip Bench Press", "bench"],
  ["romanian-deadlift", "Romanian Deadlift", "deadlift"],
  ["barbell-row", "Barbell Row", "accessory"],
];

async function apiRequest(url, accessToken, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (response.ok) return response.status === 204 ? null : response.json();

  let cause;
  try {
    cause = await response.json();
  } catch (_) {
    // Ignore bodies that are not JSON. They must never be shown to the user.
  }
  throw googleApiError(response.status, cause);
}

function loadPickerScript() {
  if (window.gapi) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PICKER_SRC;
    script.async = true;
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => reject(new Error("Unable to load Google Picker.")), { once: true });
    document.head.append(script);
  });
}

async function loadPicker() {
  await loadPickerScript();
  await new Promise((resolve) => window.gapi.load("picker", { callback: resolve }));
  if (!window.google?.picker) throw new Error("Google Picker is unavailable.");
}

export async function pickSpreadsheet({ accessToken, apiKey, appId }) {
  if (!apiKey) throw new Error("Google Picker API key is not configured.");
  if (!appId) throw new Error("Google Picker app ID (Cloud project number) is not configured.");
  await loadPicker();

  return new Promise((resolve, reject) => {
    const view = new window.google.picker.DocsView(window.google.picker.ViewId.SPREADSHEETS)
      .setIncludeFolders(false)
      .setSelectFolderEnabled(false);
    let builder = new window.google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setCallback((data) => {
        if (data.action === window.google.picker.Action.PICKED) {
          const document = data.docs?.[0];
          if (document?.id) resolve({ id: document.id, name: document.name || "Google Sheet" });
          else reject(new Error("Google Picker did not return a spreadsheet."));
        } else if (data.action === window.google.picker.Action.CANCEL) {
          reject(new DOMException("Spreadsheet selection was cancelled.", "AbortError"));
        }
      });
    builder = builder.setAppId(appId);
    builder.build().setVisible(true);
  });
}

export async function validateSpreadsheet(spreadsheetId, accessToken) {
  const fields = encodeURIComponent("properties.title,sheets.properties.title");
  const metadata = await apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=${fields}`, accessToken);
  const titles = new Set(metadata.sheets?.map((sheet) => sheet.properties?.title));
  const missingSheets = SHEET_TITLES.filter((title) => !titles.has(title));
  if (missingSheets.length > 0) throw schemaError();

  const ranges = [...SHEET_TITLES.map((title) => `${title}!1:1`), "Schema!A:B"];
  const valuesByRange = await readRanges(spreadsheetId, accessToken, ranges);
  SHEET_TITLES.forEach((title, index) => {
    const actualHeaders = new Set((valuesByRange[index]?.[0] ?? []).map(String));
    const missingHeaders = HEADERS[title].filter((header) => !actualHeaders.has(header));
    if (missingHeaders.length > 0) {
      throw schemaError();
    }
  });

  const rows = sheetRowRecords(valuesByRange[SHEET_TITLES.length] ?? []);
  const values = new Map(rows.rows.map(({ record }) => [record.key, record.value]));
  if (values.get("app_id") !== "powerlifting-training-tracker" || values.get("schema_version") !== "1") {
    throw schemaError();
  }
  return { id: spreadsheetId, name: metadata.properties?.title || "Google Sheet" };
}

export async function readRanges(spreadsheetId, accessToken, ranges) {
  const query = ranges.map((range) => `ranges=${encodeURIComponent(range)}`).join("&");
  const result = await apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchGet?majorDimension=ROWS&${query}`, accessToken);
  return result.valueRanges?.map((range) => range.values ?? []) ?? [];
}

export async function createTrainingSpreadsheet(accessToken) {
  const spreadsheet = await apiRequest(API_BASE, accessToken, {
    method: "POST",
    body: JSON.stringify({
      properties: { title: "Powerlifting Training Tracker" },
      sheets: SHEET_TITLES.map((title) => ({ properties: { title } })),
    }),
  });
  const spreadsheetId = spreadsheet.spreadsheetId;
  const now = new Date().toISOString();
  const data = Object.entries(HEADERS).map(([title, headers]) => ({ range: `${title}!A1`, values: [headers] }));
  data.push(
    { range: "Schema!A2", values: [["app_id", "powerlifting-training-tracker"], ["schema_version", "1"], ["created_at", now], ["last_migrated_at", now]] },
    { range: "Settings!A2", values: [["weight_unit", "kg", now], ["locale", "zh-TW", now], ["theme", "system", now], ["default_rpe_enabled", "false", now]] },
    { range: "Exercises!A2", values: DEFAULT_EXERCISES.map(([id, name, category]) => [id, name, category, true, true, "", now]) },
  );
  await apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, accessToken, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  });
  return validateSpreadsheet(spreadsheetId, accessToken);
}

export async function repairSpreadsheet(spreadsheetId, accessToken) {
  const fields = encodeURIComponent("properties.title,sheets.properties(sheetId,title)");
  let metadata = await apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=${fields}`, accessToken);
  const existingTitles = new Set(metadata.sheets?.map((sheet) => sheet.properties?.title));
  const missingTitles = SHEET_TITLES.filter((title) => !existingTitles.has(title));
  if (missingTitles.length > 0) {
    await apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, accessToken, {
      method: "POST",
      body: JSON.stringify({ requests: missingTitles.map((title) => ({ addSheet: { properties: { title } } })) }),
    });
  }

  const rows = await readRanges(spreadsheetId, accessToken, SHEET_TITLES.map((title) => `${title}!1:1`));
  const data = buildHeaderRepairData(rows);
  if (data.length > 0) {
    await apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, accessToken, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "RAW", data }),
    });
  }

  const [schemaRows, settingsRows, exerciseRows] = await readRanges(
    spreadsheetId,
    accessToken,
    ["Schema!A:B", "Settings!A:C", "Exercises!A:G"],
  );
  const schemaData = sheetRowRecords(schemaRows);
  const schema = new Map(schemaData.rows.map(({ record }) => [record.key, record.value]));
  if (schema.has("app_id") && schema.get("app_id") !== "powerlifting-training-tracker") throw schemaError();
  if (schema.has("schema_version") && schema.get("schema_version") !== "1") throw schemaError();
  const now = new Date().toISOString();
  if (missingTitles.length > 0) metadata = await apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=${fields}`, accessToken);
  const sheetIds = new Map(metadata.sheets?.map((sheet) => [sheet.properties?.title, sheet.properties?.sheetId]));
  const initialization = [];
  const appendRecords = (title, headers, records) => {
    if (records.length === 0) return;
    initialization.push({ appendCells: { sheetId: sheetIds.get(title), rows: records.map((record) => toAppendRow(headers, record)), fields: "userEnteredValue" } });
  };
  const schemaHeaders = schemaData.headers;
  const schemaRecords = [];
  if (!schema.has("app_id")) schemaRecords.push({ key: "app_id", value: "powerlifting-training-tracker" });
  if (!schema.has("schema_version")) schemaRecords.push({ key: "schema_version", value: "1" });
  appendRecords("Schema", schemaHeaders, schemaRecords);
  if (settingsRows.length <= 1) appendRecords("Settings", settingsRows[0].map(String), [
    { key: "weight_unit", value: "kg", updated_at: now },
    { key: "locale", value: "zh-TW", updated_at: now },
    { key: "theme", value: "system", updated_at: now },
    { key: "default_rpe_enabled", value: "false", updated_at: now },
  ]);
  if (exerciseRows.length <= 1) appendRecords("Exercises", exerciseRows[0].map(String), DEFAULT_EXERCISES.map(([id, name, category]) => ({
    exercise_id: id, exercise_name: name, category, is_default: true, is_active: true, last_used_at: "", created_at: now,
  })));
  if (initialization.length > 0) {
    await apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, accessToken, {
      method: "POST",
      body: JSON.stringify({ requests: initialization }),
    });
  }
  return validateSpreadsheet(spreadsheetId, accessToken);
}

function columnName(columnNumber) {
  let result = "";
  for (let value = columnNumber; value > 0; value = Math.floor((value - 1) / 26)) {
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  }
  return result;
}

export function buildHeaderRepairData(rows) {
  const data = [];
  SHEET_TITLES.forEach((title, index) => {
    const current = (rows[index]?.[0] ?? []).map((header) => String(header).trim());
    const missing = HEADERS[title].filter((header) => !current.includes(header));
    if (missing.length > 0) data.push({ range: `${title}!${columnName(current.length + 1)}1`, values: [missing] });
  });
  return data;
}

function toAppendRow(headers, record) {
  return {
    values: headers.map((header) => ({
      userEnteredValue: { stringValue: String(record[header] ?? "") },
    })),
  };
}

export function buildWorkoutAppendRequests(sheetIds, sessionHeaders, setHeaders, record) {
  return [
    {
      appendCells: {
        sheetId: sheetIds.get("Sessions"),
        rows: [toAppendRow(sessionHeaders, record.session)],
        fields: "userEnteredValue",
      },
    },
    {
      appendCells: {
        sheetId: sheetIds.get("Sets"),
        rows: record.sets.map((set) => toAppendRow(setHeaders, set)),
        fields: "userEnteredValue",
      },
    },
  ];
}

export async function appendWorkoutRecord(spreadsheetId, accessToken, record) {
  const fields = encodeURIComponent("sheets.properties(sheetId,title)");
  const [metadata, valuesByRange] = await Promise.all([
    apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=${fields}`, accessToken),
    readRanges(spreadsheetId, accessToken, ["Sessions!1:1", "Sets!1:1"]),
  ]);
  const sheetIds = new Map(metadata.sheets?.map((sheet) => [
    sheet.properties?.title,
    sheet.properties?.sheetId,
  ]));
  const sessionHeaders = (valuesByRange[0]?.[0] ?? []).map(String);
  const setHeaders = (valuesByRange[1]?.[0] ?? []).map(String);

  for (const [title, headers] of [["Sessions", sessionHeaders], ["Sets", setHeaders]]) {
    if (!Number.isInteger(sheetIds.get(title))) throw new Error(`Missing required sheet: ${title}.`);
    const missing = HEADERS[title].filter((header) => !headers.includes(header));
    if (missing.length > 0) throw new Error(`${title} is missing required columns: ${missing.join(", ")}.`);
  }

  const requests = buildWorkoutAppendRequests(sheetIds, sessionHeaders, setHeaders, record);
  await apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, accessToken, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
  return { sessionId: record.session.session_id };
}

function sheetRowRecords(rows) {
  const headers = (rows[0] ?? []).map((header) => String(header).trim());
  return {
    headers,
    rows: rows.slice(1).map((values, index) => ({
      rowIndex: index + 1,
      record: Object.fromEntries(headers.map((header, columnIndex) => [header, String(values[columnIndex] ?? "").trim()])),
    })),
  };
}

export function buildWorkoutDeleteRequests(sheetIds, sessionRowIndex, setRowIndices) {
  const deleteRow = (sheetId, rowIndex) => ({
    deleteDimension: {
      range: { sheetId, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 },
    },
  });
  return [
    ...[...setRowIndices].sort((left, right) => right - left)
      .map((rowIndex) => deleteRow(sheetIds.get("Sets"), rowIndex)),
    deleteRow(sheetIds.get("Sessions"), sessionRowIndex),
  ];
}

export function buildWorkoutReplaceRequests(sheetIds, sessionHeaders, setHeaders, sessionRowIndex, setRowIndices, record) {
  return [
    ...[...setRowIndices].sort((left, right) => right - left).map((rowIndex) => ({
      deleteDimension: {
        range: { sheetId: sheetIds.get("Sets"), dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 },
      },
    })),
    {
      updateCells: {
        range: {
          sheetId: sheetIds.get("Sessions"),
          startRowIndex: sessionRowIndex,
          endRowIndex: sessionRowIndex + 1,
          startColumnIndex: 0,
          endColumnIndex: sessionHeaders.length,
        },
        rows: [toAppendRow(sessionHeaders, record.session)],
        fields: "userEnteredValue",
      },
    },
    {
      appendCells: {
        sheetId: sheetIds.get("Sets"),
        rows: record.sets.map((set) => toAppendRow(setHeaders, set)),
        fields: "userEnteredValue",
      },
    },
  ];
}

async function workoutMutationContext(spreadsheetId, accessToken) {
  const fields = encodeURIComponent("sheets.properties(sheetId,title)");
  const [metadata, valuesByRange] = await Promise.all([
    apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=${fields}`, accessToken),
    readRanges(spreadsheetId, accessToken, ["Sessions", "Sets"]),
  ]);
  const sheetIds = new Map(metadata.sheets?.map((sheet) => [sheet.properties?.title, sheet.properties?.sheetId]));
  const sessions = sheetRowRecords(valuesByRange[0] ?? []);
  const sets = sheetRowRecords(valuesByRange[1] ?? []);
  for (const [title, data] of [["Sessions", sessions], ["Sets", sets]]) {
    if (!Number.isInteger(sheetIds.get(title))) throw new Error(`Missing required sheet: ${title}.`);
    const missing = HEADERS[title].filter((header) => !data.headers.includes(header));
    if (missing.length > 0) throw new Error(`${title} is missing required columns: ${missing.join(", ")}.`);
  }
  return { sheetIds, sessions, sets };
}

export async function deleteWorkoutRecord(spreadsheetId, accessToken, sessionId) {
  const context = await workoutMutationContext(spreadsheetId, accessToken);
  const session = context.sessions.rows.find((row) => row.record.session_id === sessionId);
  if (!session) throw new Error("找不到要刪除的訓練紀錄，資料可能已被修改。");
  const setRows = context.sets.rows.filter((row) => row.record.session_id === sessionId).map((row) => row.rowIndex);
  const requests = buildWorkoutDeleteRequests(context.sheetIds, session.rowIndex, setRows);
  await apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, accessToken, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

export async function replaceWorkoutRecord(spreadsheetId, accessToken, sessionId, record) {
  const context = await workoutMutationContext(spreadsheetId, accessToken);
  const session = context.sessions.rows.find((row) => row.record.session_id === sessionId);
  if (!session) throw new Error("找不到要編輯的訓練紀錄，資料可能已被修改。");
  const now = new Date().toISOString();
  record.session = {
    ...session.record,
    session_id: sessionId,
    training_date: record.session.training_date,
    title: record.session.title,
    duration_minutes: record.session.duration_minutes,
    updated_at: now,
  };
  record.sets = record.sets.map((set) => ({ ...set, session_id: sessionId, updated_at: now }));
  const setRows = context.sets.rows.filter((row) => row.record.session_id === sessionId).map((row) => row.rowIndex);
  const requests = buildWorkoutReplaceRequests(
    context.sheetIds,
    context.sessions.headers,
    context.sets.headers,
    session.rowIndex,
    setRows,
    record,
  );
  await apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, accessToken, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
  return { sessionId };
}

export async function upsertGoals(spreadsheetId, accessToken, goals) {
  const fields = encodeURIComponent("sheets.properties(sheetId,title)");
  const [metadata, valuesByRange] = await Promise.all([
    apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=${fields}`, accessToken),
    readRanges(spreadsheetId, accessToken, ["Goals"]),
  ]);
  const goalSheet = metadata.sheets?.find((sheet) => sheet.properties?.title === "Goals");
  const sheetId = goalSheet?.properties?.sheetId;
  if (!Number.isInteger(sheetId)) throw schemaError();

  const rows = valuesByRange[0] ?? [];
  const headers = (rows[0] ?? []).map((header) => String(header).trim());
  const missing = HEADERS.Goals.filter((header) => !headers.includes(header));
  if (missing.length > 0) throw schemaError();

  const existingRows = rows.slice(1).map((values, index) => ({
    rowIndex: index + 1,
    record: Object.fromEntries(headers.map((header, columnIndex) => [header, String(values[columnIndex] ?? "").trim()])),
  }));
  const requests = buildGoalUpsertRequests(sheetId, headers, existingRows, goals);
  if (requests.length === 0) return;
  await apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, accessToken, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

export async function deleteGoal(spreadsheetId, accessToken, goalId) {
  const fields = encodeURIComponent("sheets.properties(sheetId,title)");
  const [metadata, valuesByRange] = await Promise.all([
    apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=${fields}`, accessToken),
    readRanges(spreadsheetId, accessToken, ["Goals"]),
  ]);
  const sheetId = metadata.sheets?.find((sheet) => sheet.properties?.title === "Goals")?.properties?.sheetId;
  if (!Number.isInteger(sheetId)) throw schemaError();
  const rows = sheetRowRecords(valuesByRange[0] ?? []);
  const goal = rows.rows.find((row) => row.record.goal_id === goalId);
  if (!goal) throw new Error("找不到要刪除的訓練目標，資料可能已被修改。");
  await apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, accessToken, {
    method: "POST",
    body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: goal.rowIndex, endIndex: goal.rowIndex + 1 } } }] }),
  });
}

export function buildGoalUpsertRequests(sheetId, headers, existingRows, goals) {
  const byId = new Map(existingRows.filter((row) => row.record.goal_id).map((row) => [row.record.goal_id, row]));
  const byLift = new Map(existingRows.filter((row) => row.record.lift).map((row) => [row.record.lift, row]));
  return goals.map((goal) => {
    const existing = byId.get(goal.goal_id) ?? byLift.get(goal.lift);
    if (!existing) {
      return {
        appendCells: {
          sheetId,
          rows: [toAppendRow(headers, goal)],
          fields: "userEnteredValue",
        },
      };
    }
    return {
      updateCells: {
        range: {
          sheetId,
          startRowIndex: existing.rowIndex,
          endRowIndex: existing.rowIndex + 1,
          startColumnIndex: 0,
          endColumnIndex: headers.length,
        },
        rows: [toAppendRow(headers, goal)],
        fields: "userEnteredValue",
      },
    };
  });
}

export function buildSettingUpsertRequests(sheetId, headers, existingRows, settings) {
  const byKey = new Map(existingRows.filter((row) => row.record.key).map((row) => [row.record.key, row]));
  return settings.map((setting) => {
    const existing = byKey.get(setting.key);
    if (!existing) return { appendCells: { sheetId, rows: [toAppendRow(headers, setting)], fields: "userEnteredValue" } };
    return {
      updateCells: {
        range: { sheetId, startRowIndex: existing.rowIndex, endRowIndex: existing.rowIndex + 1, startColumnIndex: 0, endColumnIndex: headers.length },
        rows: [toAppendRow(headers, setting)],
        fields: "userEnteredValue",
      },
    };
  });
}

export async function upsertSettings(spreadsheetId, accessToken, settings) {
  const fields = encodeURIComponent("sheets.properties(sheetId,title)");
  const [metadata, valuesByRange] = await Promise.all([
    apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=${fields}`, accessToken),
    readRanges(spreadsheetId, accessToken, ["Settings"]),
  ]);
  const sheetId = metadata.sheets?.find((sheet) => sheet.properties?.title === "Settings")?.properties?.sheetId;
  if (!Number.isInteger(sheetId)) throw schemaError();
  const rows = sheetRowRecords(valuesByRange[0] ?? []);
  if (HEADERS.Settings.some((header) => !rows.headers.includes(header))) throw schemaError();
  const requests = buildSettingUpsertRequests(sheetId, rows.headers, rows.rows, settings);
  await apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, accessToken, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

export { HEADERS };
