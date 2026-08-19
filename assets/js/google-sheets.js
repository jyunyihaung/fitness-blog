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

  let message = `Google API returned ${response.status}.`;
  try {
    const body = await response.json();
    message = body.error?.message || message;
  } catch (_) {
    // Keep the sanitized HTTP status message when Google returns a non-JSON body.
  }
  const error = new Error(message);
  error.status = response.status;
  throw error;
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
  if (missingSheets.length > 0) throw new Error(`Missing required sheets: ${missingSheets.join(", ")}.`);

  const ranges = [...SHEET_TITLES.map((title) => `${title}!1:1`), "Schema!A:B"];
  const valuesByRange = await readRanges(spreadsheetId, accessToken, ranges);
  SHEET_TITLES.forEach((title, index) => {
    const actualHeaders = new Set((valuesByRange[index]?.[0] ?? []).map(String));
    const missingHeaders = HEADERS[title].filter((header) => !actualHeaders.has(header));
    if (missingHeaders.length > 0) {
      throw new Error(`${title} is missing required columns: ${missingHeaders.join(", ")}.`);
    }
  });

  const rows = valuesByRange[SHEET_TITLES.length] ?? [];
  const values = new Map(rows.slice(1).map(([key, value]) => [key, String(value)]));
  if (values.get("app_id") !== "powerlifting-training-tracker" || values.get("schema_version") !== "1") {
    throw new Error("The selected spreadsheet is not a compatible version 1 training tracker.");
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

function toAppendRow(headers, record) {
  return {
    values: headers.map((header) => ({
      userEnteredValue: { stringValue: String(record[header] ?? "") },
    })),
  };
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

  const requests = [
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
  await apiRequest(`${API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, accessToken, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
  return { sessionId: record.session.session_id };
}

export { HEADERS };
