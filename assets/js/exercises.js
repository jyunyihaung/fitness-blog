const CATEGORIES = new Set(["squat", "bench", "deadlift", "accessory"]);

function toBoolean(value) {
  return ["true", "1", "yes"].includes(String(value).trim().toLowerCase());
}

export function normalizeExerciseName(name) {
  return String(name ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function parseExercises(rows) {
  const [rawHeaders = [], ...values] = rows ?? [];
  const headers = rawHeaders.map((header) => String(header).trim());
  const required = ["exercise_id", "exercise_name", "category", "is_default", "is_active", "last_used_at", "created_at"];
  if (required.some((header) => !headers.includes(header))) throw new Error("Exercises schema is invalid.");
  return values.map((row) => Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? "").trim()])))
    .filter((record) => record.exercise_id && record.exercise_name)
    .map((record) => ({
      id: record.exercise_id,
      name: record.exercise_name,
      normalizedName: normalizeExerciseName(record.exercise_name),
      category: CATEGORIES.has(record.category) ? record.category : "accessory",
      isDefault: toBoolean(record.is_default),
      isActive: toBoolean(record.is_active),
      lastUsedAt: record.last_used_at,
      createdAt: record.created_at,
    }));
}

export function validateExerciseInput(input, exercises, currentId = "") {
  const errors = [];
  const name = String(input.name ?? "").trim();
  const normalized = normalizeExerciseName(name);
  if (!name) errors.push("請輸入動作名稱。");
  if (name.length > 120) errors.push("動作名稱不可超過 120 字。");
  if (!/[\p{L}\p{N}]/u.test(name)) errors.push("動作名稱必須包含文字或數字。");
  if (!CATEGORIES.has(input.category)) errors.push("請選擇有效的動作分類。");
  const duplicate = (exercises ?? []).find((exercise) => exercise.id !== currentId && exercise.normalizedName === normalized);
  if (duplicate) errors.push(duplicate.isActive ? "已有相同名稱的動作。" : "已有相同名稱的停用動作，請重新啟用該動作。");
  return errors;
}

export function sortExerciseSuggestions(exercises, { includeInactive = false } = {}) {
  return [...(exercises ?? [])]
    .filter((exercise) => includeInactive || exercise.isActive)
    .sort((left, right) => (
      String(right.lastUsedAt).localeCompare(String(left.lastUsedAt))
      || Number(right.isDefault) - Number(left.isDefault)
      || left.name.localeCompare(right.name)
    ));
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function createExerciseRecord(input, now = new Date().toISOString()) {
  return {
    exercise_id: input.id || createId(),
    exercise_name: String(input.name).trim().replace(/\s+/g, " "),
    category: input.category,
    is_default: String(Boolean(input.isDefault)),
    is_active: String(input.isActive !== false),
    last_used_at: input.lastUsedAt ?? "",
    created_at: input.createdAt || now,
  };
}

export function planExerciseSync(exercises, workoutExercises, usedAt = new Date().toISOString()) {
  const byName = new Map();
  (exercises ?? []).forEach((exercise) => {
    if (!byName.has(exercise.normalizedName)) byName.set(exercise.normalizedName, exercise);
  });
  const unique = new Map();
  (workoutExercises ?? []).forEach((exercise) => {
    const normalized = normalizeExerciseName(exercise.name);
    if (normalized && !unique.has(normalized)) unique.set(normalized, exercise);
  });
  return Array.from(unique.entries()).map(([normalized, input]) => {
    const existing = byName.get(normalized);
    if (existing) return {
      type: "update",
      id: existing.id,
      record: createExerciseRecord({ ...existing, isActive: true, lastUsedAt: usedAt }),
    };
    return {
      type: "append",
      record: createExerciseRecord({ name: input.name, category: input.category, isActive: true, lastUsedAt: usedAt }),
    };
  });
}
