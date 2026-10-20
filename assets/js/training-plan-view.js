// Phase 2 display model: plain functions that never mutate Sheets response rows.
// All labels are text, not HTML, to avoid injection of coach/user content.
export function formatPlannedReps(row) {
  switch (row.reps_kind) {
    case "fixed": return String(row.reps_value || "—") + " 次";
    case "range": return row.reps_min + "–" + row.reps_max + " 次";
    case "until_rpe": return "至 RPE " + row.reps_rpe;
    case "needs_review": return "次數待確認：" + String(row.reps_raw ?? "");
    default: return "次數未指定";
  }
}

export function formatPlannedLoad(row) {
  switch (row.load_kind) {
    case "fixed": return row.load_value + " " + (row.load_unit || "kg");
    case "bodyweight": return "自體重量 (BW)";
    case "rpe_target": return "RPE " + row.load_rpe;
    case "bounded": return row.load_operator + " " + row.load_value + " " + row.load_unit;
    case "needs_review": return "重量待確認：" + String(row.load_raw ?? "");
    default: return "重量未指定";
  }
}

export function formatPlannedItem(row) {
  if (row.item_kind === "activity" && row.target_metric === "steps") {
    return "至少 " + row.target_minimum + " 步";
  }
  const count = Number(row.target_sets);
  return [
    Number.isInteger(count) && count > 0 ? count + " 組" : "組數未指定",
    formatPlannedReps(row),
    formatPlannedLoad(row),
  ].join(" · ");
}

export function groupTrainingPlan(records, planId) {
  const plan = records?.plans?.find((p) => p.plan_id === planId);
  if (!plan) return null;
  const workouts = (records.workouts ?? []).filter((w) => w.plan_id === planId);
  const workoutIds = new Set(workouts.map((w) => w.workout_id));
  const itemsByWorkout = new Map();
  for (const item of records.sets ?? []) {
    if (!workoutIds.has(item.workout_id)) continue;
    const items = itemsByWorkout.get(item.workout_id) ?? [];
    items.push(item);
    itemsByWorkout.set(item.workout_id, items);
  }
  for (const items of itemsByWorkout.values()) {
    items.sort((a, b) => Number(a.exercise_order) - Number(b.exercise_order));
  }
  const weeks = Array.from({ length: Number(plan.week_count) }, (_, index) => ({
    week: index + 1,
    workouts: workouts.filter((w) => Number(w.week_number) === index + 1)
      .sort((a, b) => Number(a.day_number) - Number(b.day_number))
      .map((w) => ({ ...w, items: itemsByWorkout.get(w.workout_id) ?? [] })),
  }));
  return { ...plan, weeks };
}

// Blank plans are explicit drafts; missing weeks are not silently copied.
export function createBlankNormalizedPlan(weekCount, dayCount) {
  const week = Number(weekCount);
  const day = Number(dayCount);
  if (!Number.isInteger(week) || week < 1 || week > 52 ||
      !Number.isInteger(day) || day < 1 || day > 7) {
    throw new Error("週數需為 1–52，每週訓練日數需為 1–7。");
  }
  return {
    format: "fitness-blog-coach-plan", version: 1,
    source: { sheet: "Manual" },
    blocks: [{ name: "Custom", weeks: Array.from({ length: week }, (_, wi) => ({
      week: wi + 1, notes: [],
      workouts: Array.from({ length: day }, (_, di) => ({
        day: di + 1, status: "not_provided", items: [],
      })),
    })) }],
  };
}

export function parseLocalPlanJson(jsonString) {
  if (typeof jsonString !== "string" || jsonString.length > 1024 * 1024) {
    throw new Error("JSON 檔案過大（上限 1 MB）。");
  }
  let parsed;
  try { parsed = JSON.parse(jsonString); } catch (_) { throw new Error("無法解析 JSON 檔案。"); }
  if (parsed?.format !== "fitness-blog-coach-plan" || parsed.version !== 1
    || !Array.isArray(parsed.blocks) || parsed.blocks.length !== 1
    || !Array.isArray(parsed.blocks[0]?.weeks) || parsed.blocks[0].weeks.length > 52) {
    throw new Error("請使用 Phase 0 匯出的教練課表 JSON（版本 1）。");
  }
  return parsed;
}
