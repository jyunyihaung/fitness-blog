import { validateWorkoutInput } from "./record-validation.js";

const FORMAT = "fitness-blog-workout-template";
const VERSION = 1;
const PREFIX = `FITNESS-WORKOUT:${VERSION}`;
const MAX_INPUT_LENGTH = 100_000;
const MAX_PAYLOAD_BYTES = 65_536;
const MAX_EXERCISES = 30;
const MAX_SETS_PER_EXERCISE = 30;
const MAX_TOTAL_SETS = 200;
const TRANSPORT_WHITESPACE = /[\s\u200B\u200C\u200D\u2060\uFEFF]/g;

export class WorkoutShareCodeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorkoutShareCodeError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new WorkoutShareCodeError(code, message);
}

function normalizeTransportInput(text) {
  const rawInput = String(text ?? "");
  if (!/%[a-fA-F0-9]{2}/.test(rawInput)) return rawInput;
  try {
    return decodeURIComponent(rawInput);
  } catch (_) {
    const transportCharacters = { "09": "\t", "0a": "\n", "0d": "\r", "20": " ", "3a": ":" };
    return rawInput.replace(/%(09|0A|0D|20|3A)/gi, (_, hex) => transportCharacters[hex.toLowerCase()]);
  }
}

function visibleExcerpt(text, start, length = 100) {
  return JSON.stringify(text.slice(start, start + length));
}

export function getWorkoutShareCodeDiagnostics(text) {
  const rawInput = String(text ?? "");
  const input = normalizeTransportInput(rawInput);
  const suspicious = Array.from(input).flatMap((character, index) => {
    if (/^[\x20-\x7E\s]$/.test(character)) return [];
    return [`${index}: U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`];
  }).slice(0, 12);
  return [
    `原始長度：${rawInput.length}`,
    `正規化後長度：${input.length}`,
    `URL 編碼：${rawInput === input ? "否" : "是，已還原"}`,
    `前綴 FITNESS-WORKOUT:1：${input.includes(PREFIX) ? "找到" : "找不到"}`,
    `CHECKSUM 標記：${input.includes(":CHECKSUM:") ? "找到" : "找不到"}`,
    `結尾 :END：${input.includes(":END") ? "找到" : "找不到"}`,
    `開頭片段：${visibleExcerpt(input, 0)}`,
    `結尾片段：${visibleExcerpt(input, Math.max(0, input.length - 100))}`,
    `可疑 Unicode：${suspicious.length > 0 ? suspicious.join(", ") : "無"}`,
  ].join("\n");
}

function sanitizeDraft(workout) {
  return {
    mode: "import",
    trainingDate: String(workout.trainingDate ?? ""),
    title: String(workout.title ?? ""),
    durationMinutes: String(workout.durationMinutes ?? ""),
    notes: String(workout.notes ?? ""),
    exercises: Array.isArray(workout.exercises) ? workout.exercises.map((exercise) => ({
      name: String(exercise?.name ?? ""),
      category: String(exercise?.category ?? ""),
      sets: Array.isArray(exercise?.sets) ? exercise.sets.map((set) => ({
        weightKg: String(set?.weightKg ?? ""),
        reps: String(set?.reps ?? ""),
        rpe: String(set?.rpe ?? ""),
        type: String(set?.type ?? ""),
        isWarmup: set?.isWarmup === true,
        notes: String(set?.notes ?? ""),
      })) : [],
    })) : [],
  };
}

export function validateWorkoutTemplate(template) {
  if (!template || typeof template !== "object" || Array.isArray(template)) fail("invalid_template", "課表內容格式無效。");
  if (template.format !== FORMAT || template.version !== VERSION) fail("unsupported_version", "這份課表代碼不是目前支援的版本。");
  if (!template.workout || typeof template.workout !== "object" || Array.isArray(template.workout)) fail("invalid_template", "課表缺少訓練內容。");
  const draft = sanitizeDraft(template.workout);
  if (draft.exercises.length > MAX_EXERCISES) fail("too_many_exercises", `一份課表最多包含 ${MAX_EXERCISES} 個動作。`);
  if (draft.exercises.some((exercise) => exercise.sets.length > MAX_SETS_PER_EXERCISE)) fail("too_many_sets", `每個動作最多包含 ${MAX_SETS_PER_EXERCISE} 組。`);
  const totalSets = draft.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
  if (totalSets > MAX_TOTAL_SETS) fail("too_many_sets", `一份課表最多包含 ${MAX_TOTAL_SETS} 組。`);
  const errors = validateWorkoutInput(draft);
  if (errors.length > 0) fail("invalid_workout", errors.join("\n"));
  return draft;
}

export function createWorkoutTemplate(input, { displayName = "" } = {}) {
  const workout = sanitizeDraft(input);
  delete workout.mode;
  delete workout.notes;
  workout.exercises.forEach((exercise) => {
    exercise.sets.forEach((set) => delete set.notes);
  });
  const template = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    source: { type: "coach", displayName: String(displayName).trim().slice(0, 80) },
    workout,
  };
  validateWorkoutTemplate(template);
  return template;
}

function encodeBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(payload) {
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) fail("invalid_encoding", "課表代碼的編碼內容無效。");
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
  try {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.byteLength > MAX_PAYLOAD_BYTES) fail("payload_too_large", "課表內容超過允許大小。");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof WorkoutShareCodeError) throw error;
    fail("invalid_encoding", "課表代碼的編碼內容無效。");
  }
}

async function checksum(payload) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export async function encodeWorkoutShareCode(template) {
  validateWorkoutTemplate(template);
  const json = JSON.stringify(template);
  if (new TextEncoder().encode(json).byteLength > MAX_PAYLOAD_BYTES) fail("payload_too_large", "課表內容超過允許大小。");
  const payload = encodeBase64Url(json);
  return `${PREFIX}:${payload}:CHECKSUM:${await checksum(payload)}:END`;
}

function extractShareCode(text) {
  const rawInput = String(text ?? "");
  if (rawInput.length > MAX_INPUT_LENGTH) fail("input_too_large", "貼上的文字超過允許大小。");
  const input = normalizeTransportInput(rawInput);
  if (input.length > MAX_INPUT_LENGTH) fail("input_too_large", "貼上的文字超過允許大小。");
  const pattern = /FITNESS-WORKOUT:(\d+)(?::|[\s\u200B\u200C\u200D\u2060\uFEFF]+)([A-Za-z0-9_\s\u200B\u200C\u200D\u2060\uFEFF-]+?)[\s\u200B\u200C\u200D\u2060\uFEFF]*:CHECKSUM:[\s\u200B\u200C\u200D\u2060\uFEFF]*([a-fA-F0-9]{16})[\s\u200B\u200C\u200D\u2060\uFEFF]*:END/g;
  const matches = Array.from(input.matchAll(pattern));
  if (matches.length === 0 && input.includes("\uFFFD")) fail("corrupted_text", "課表代碼含有無法辨識的字元，請重新複製完整的單行代碼。");
  if (matches.length === 0) fail("code_not_found", "找不到完整的 FITNESS-WORKOUT 課表代碼。");
  if (matches.length > 1) fail("multiple_codes", "找到多份課表代碼，請一次只貼上一份。");
  const [, version, rawPayload, expectedChecksum] = matches[0];
  if (Number(version) !== VERSION) fail("unsupported_version", "這份課表代碼不是目前支援的版本。");
  return { payload: rawPayload.replace(TRANSPORT_WHITESPACE, ""), expectedChecksum: expectedChecksum.toLowerCase() };
}

export async function decodeWorkoutShareCode(text) {
  const { payload, expectedChecksum } = extractShareCode(text);
  if (await checksum(payload) !== expectedChecksum) fail("checksum_mismatch", "課表代碼不完整或內容已被修改，請重新複製完整代碼。");
  let template;
  try {
    template = JSON.parse(decodeBase64Url(payload));
  } catch (error) {
    if (error instanceof WorkoutShareCodeError) throw error;
    fail("invalid_json", "課表代碼無法解析。");
  }
  const draft = validateWorkoutTemplate(template);
  return {
    template,
    draft,
    summary: {
      displayName: String(template.source?.displayName ?? "").slice(0, 80),
      exportedAt: String(template.exportedAt ?? ""),
      exerciseCount: draft.exercises.length,
      setCount: draft.exercises.reduce((total, exercise) => total + exercise.sets.length, 0),
    },
  };
}
