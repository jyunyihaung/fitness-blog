import { findBestEstimatedOneRepMax } from "./one-rep-max.js";

export const GOAL_LIFTS = ["squat", "bench", "deadlift"];

const GOAL_LABELS = {
  squat: "深蹲",
  bench: "臥推",
  deadlift: "硬舉",
};

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isHalfKilogram(value) {
  return Math.abs(Number(value) * 2 - Math.round(Number(value) * 2)) < Number.EPSILON * 10;
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function parseGoals(rows) {
  const [rawHeaders = [], ...values] = rows ?? [];
  const headers = rawHeaders.map((header) => String(header).trim());
  const required = ["goal_id", "lift", "target_weight_kg", "current_weight_kg", "target_date", "notes", "updated_at"];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length > 0) throw new Error(`Goals is missing required columns: ${missing.join(", ")}.`);
  return values
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? "").trim()])))
    .filter((goal) => goal.goal_id && GOAL_LIFTS.includes(goal.lift))
    .map((goal) => ({
      id: goal.goal_id,
      lift: goal.lift,
      targetWeightKg: toNumber(goal.target_weight_kg),
      currentWeightKg: toNumber(goal.current_weight_kg),
      targetDate: goal.target_date,
      notes: goal.notes,
      updatedAt: goal.updated_at,
    }));
}

export function validateGoals(goals) {
  const errors = [];
  const activeGoals = goals.filter((goal) => goal.targetWeightKg !== "");
  if (activeGoals.length === 0) errors.push("請至少設定一個目標重量。");
  activeGoals.forEach((goal) => {
    const label = GOAL_LABELS[goal.lift] ?? goal.lift;
    if (!GOAL_LIFTS.includes(goal.lift)) errors.push(`${label}：項目無效。`);
    if (toNumber(goal.targetWeightKg) <= 0 || !isHalfKilogram(goal.targetWeightKg)) {
      errors.push(`${label}：目標重量必須大於 0，並以 0.5 kg 為單位。`);
    }
    if (goal.currentWeightKg !== "" && (toNumber(goal.currentWeightKg) < 0 || !isHalfKilogram(goal.currentWeightKg))) {
      errors.push(`${label}：目前重量必須大於或等於 0，並以 0.5 kg 為單位。`);
    }
    if (goal.targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(goal.targetDate)) {
      errors.push(`${label}：目標日期無效。`);
    }
  });
  return errors;
}

export function createGoalRecords(goals) {
  const now = new Date().toISOString();
  return goals
    .filter((goal) => goal.targetWeightKg !== "")
    .map((goal) => ({
      goal_id: goal.id || createId(),
      lift: goal.lift,
      target_weight_kg: String(Number(goal.targetWeightKg)),
      current_weight_kg: goal.currentWeightKg === "" ? "" : String(Number(goal.currentWeightKg)),
      target_date: goal.targetDate,
      notes: goal.notes.trim(),
      updated_at: now,
    }));
}

export function createGoalProgress(goals, workouts) {
  return goals.map((goal) => {
    const progress = goal.targetWeightKg > 0 ? goal.currentWeightKg / goal.targetWeightKg * 100 : 0;
    return {
      ...goal,
      label: GOAL_LABELS[goal.lift] ?? goal.lift,
      progress: Math.round(progress * 10) / 10,
      displayProgress: Math.min(100, Math.max(0, progress)),
      estimatedOneRepMax: findBestEstimatedOneRepMax(workouts, goal.lift),
    };
  });
}
