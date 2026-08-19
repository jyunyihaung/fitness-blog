function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

import { readRanges } from "./google-sheets.js";

function rowsToRecords(rows, requiredHeaders) {
  const [headers = [], ...values] = rows;
  const normalizedHeaders = headers.map((header) => String(header).trim());
  const missingHeaders = requiredHeaders.filter((header) => !normalizedHeaders.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required columns: ${missingHeaders.join(", ")}.`);
  }
  return values
    .filter((row) => row.some((value) => String(value ?? "").trim()))
    .map((row) => Object.fromEntries(
      normalizedHeaders.map((header, index) => [header, String(row[index] ?? "").trim()])
    ));
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toBoolean(value) {
  return ["true", "1", "yes"].includes(String(value).trim().toLowerCase());
}

function normalizeDate(value) {
  const dateFunction = /^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)$/.exec(value);
  if (!dateFunction) return value;

  const [, year, zeroBasedMonth, day] = dateFunction;
  return `${year}-${String(Number(zeroBasedMonth) + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function groupSetsBySession(sets) {
  return sets.reduce((sessions, set) => {
    const sessionSets = sessions.get(set.session_id) ?? [];
    sessionSets.push(set);
    sessions.set(set.session_id, sessionSets);
    return sessions;
  }, new Map());
}

function groupExercises(sets) {
  const exercises = new Map();
  sets
    .sort((left, right) => toNumber(left.set_order) - toNumber(right.set_order))
    .forEach((set) => {
      const name = set.exercise_name || "Unknown exercise";
      const exercise = exercises.get(name) ?? {
        name,
        category: set.exercise_category || "accessory",
        sets: [],
      };
      exercise.sets.push({
        weight: toNumber(set.weight_kg),
        reps: toNumber(set.reps),
        rpe: set.rpe ? toNumber(set.rpe) : null,
        isWarmup: toBoolean(set.is_warmup),
        type: set.set_type || "working",
      });
      exercises.set(name, exercise);
    });
  return Array.from(exercises.values());
}

export function mapSheetRecordsToWorkouts(sessions, sets) {
  const setsBySession = groupSetsBySession(sets);
  return sessions
    .filter((session) => session.session_id && session.training_date)
    .map((session) => ({
      id: session.session_id,
      date: normalizeDate(session.training_date),
      workout: session.title || "Workout",
      duration: toNumber(session.duration_minutes),
      notes: session.notes || "",
      exercises: groupExercises(setsBySession.get(session.session_id) ?? []),
    }))
    .sort((left, right) => right.date.localeCompare(left.date));
}

function buildCsvUrl(spreadsheetId, sheetName) {
  const id = encodeURIComponent(spreadsheetId);
  const sheet = encodeURIComponent(sheetName);
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${sheet}`;
}

async function fetchSheet(spreadsheetId, sheetName, requiredHeaders) {
  const response = await fetch(buildCsvUrl(spreadsheetId, sheetName));
  if (!response.ok) {
    throw new Error(`Google Sheets returned ${response.status} for ${sheetName}.`);
  }
  try {
    return rowsToRecords(parseCsv(await response.text()), requiredHeaders);
  } catch (error) {
    throw new Error(`${sheetName}: ${error.message}`);
  }
}

export async function getWorkoutData(options = {}) {
  const config = window.FitnessConfig;
  const spreadsheetId = options.spreadsheetId || config?.googleSheets?.spreadsheetId?.trim();
  if (!spreadsheetId) {
    throw new Error("Google Sheets spreadsheet ID is not configured.");
  }

  let sessions;
  let sets;
  if (options.accessToken) {
    const [sessionRows, setRows] = await readRanges(spreadsheetId, options.accessToken, ["Sessions", "Sets"]);
    sessions = rowsToRecords(sessionRows, ["session_id", "training_date", "title"]);
    sets = rowsToRecords(setRows, ["session_id", "exercise_name", "set_order", "weight_kg", "reps"]);
  } else {
    [sessions, sets] = await Promise.all([
      fetchSheet(spreadsheetId, "Sessions", ["session_id", "training_date", "title"]),
      fetchSheet(spreadsheetId, "Sets", ["session_id", "exercise_name", "set_order", "weight_kg", "reps"]),
    ]);
  }
  return mapSheetRecordsToWorkouts(sessions, sets);
}
