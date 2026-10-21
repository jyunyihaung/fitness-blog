// Phase 1: flat, header-addressed training-plan records. No historical workouts here.
// Every field maps to its own Google Sheets column (no JSON blobs in cells).
export const PLAN_HEADERS = Object.freeze({
  TrainingPlans: [
    "plan_id", "title", "block_name", "week_count", "day_count", "status",
    "source_sheet", "notes", "created_at", "updated_at", "plan_schema_version",
  ],
  PlannedWorkouts: [
    "workout_id", "plan_id", "week_number", "day_number", "planned_date",
    "title", "status", "notes", "created_at", "updated_at",
  ],
  PlannedSets: [
    "planned_set_id", "workout_id", "exercise_order", "exercise_name", "item_kind",
    "target_sets", "reps_kind", "reps_value", "reps_min", "reps_max", "reps_rpe", "reps_raw",
    "load_kind", "load_value", "load_unit", "load_operator", "load_rpe", "load_raw",
    "target_metric", "target_minimum", "coach_notes", "source_row",
    "created_at", "updated_at",
    "exercise_group_id", "set_order", "set_type", "is_warmup", "set_notes", "exercise_category",
  ],
});
export const PLAN_TITLES = Object.freeze(Object.keys(PLAN_HEADERS));
export const PLAN_SCHEMA_VERSION = "1";

const ITEM_KINDS = new Set(["exercise", "warmup", "cooldown", "activity"]);
const REPS_KINDS = new Set(["unspecified", "fixed", "range", "until_rpe", "needs_review"]);
const LOAD_KINDS = new Set(["unspecified", "fixed", "bodyweight", "rpe_target", "bounded", "needs_review"]);

function required(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(label + " 為必填文字。");
  return value.trim();
}

function positiveInt(value, label) {
  const n = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(n) || n < 1) {
    throw new Error(label + " 必須是正整數。");
  }
  return n;
}

function optionalPositiveInt(value, label) {
  if (value === "" || value === null || value === undefined) return null;
  return positiveInt(value, label);
}

function finiteNonnegative(value, label) {
  if (value === "" || value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) < 0) {
    throw new Error(label + " 必須是非負數。");
  }
  return Number(value);
}

function validatePrescription(item) {
  if (!ITEM_KINDS.has(item.item_kind)) throw new Error("未知的動作類型。");
  if (!REPS_KINDS.has(item.reps_kind) || !LOAD_KINDS.has(item.load_kind)) {
    throw new Error("未知的課表次數或重量格式。");
  }
  optionalPositiveInt(item.target_sets, "目標組數");
  if (item.reps_kind === "fixed") positiveInt(item.reps_value, "目標次數");
  if (item.reps_kind === "range") {
    if (positiveInt(item.reps_min, "最少次數") > positiveInt(item.reps_max, "最多次數")) {
      throw new Error("目標次數區間順序不正確。");
    }
  }
  if (item.reps_kind === "until_rpe") validateRpe(item.reps_rpe, "目標次數 RPE");
  if (item.reps_kind === "needs_review") required(item.reps_raw, "待確認次數原始值");
  if (item.load_kind === "fixed" || item.load_kind === "bounded") {
    finiteNonnegative(item.load_value, "目標重量");
    if (!["kg", "lbs", "lb"].includes(item.load_unit)) throw new Error("重量單位必須是 kg 或 lbs。");
  }
  if (item.load_kind === "bounded" && !["<", "<=", ">", ">="].includes(item.load_operator)) {
    throw new Error("重量邊界運算子不正確。");
  }
  if (item.load_kind === "rpe_target") validateRpe(item.load_rpe, "目標重量 RPE");
  if (item.load_kind === "needs_review") required(item.load_raw, "待確認重量原始值");
  if (item.target_metric) {
    if (item.target_metric !== "steps") throw new Error("不支援的活動目標種類。");
    positiveInt(item.target_minimum, "目標步數");
  }
}

function validateRpe(value, label) {
  const n = Number(value);
  if (value === "" || value === null || value === undefined || !Number.isFinite(n) || n < 1 || n > 10) {
    throw new Error(label + " 必須介於 1 至 10。");
  }
}

export function validateTrainingPlanRecords(records) {
  if (!records || typeof records !== "object" || !records.plan || !Array.isArray(records.workouts)
    || !Array.isArray(records.sets)) throw new Error("訓練計畫需要 plan、workouts、sets。");
  const { plan, workouts, sets } = records;
  const planId = required(plan.plan_id, "計畫 ID");
  required(plan.title, "計畫名稱");
  const weekCount = positiveInt(plan.week_count, "週數");
  const dayCount = positiveInt(plan.day_count, "每週訓練日數");
  if (plan.plan_schema_version !== PLAN_SCHEMA_VERSION) throw new Error("不支援的課表資料版本。");
  if (!["draft", "active", "archived"].includes(plan.status)) throw new Error("未知的課表狀態。");
  if (workouts.length > 366 || sets.length > 2000) throw new Error("課表超過可匯入的最大長度。");

  const workoutIds = new Set();
  const daySlots = new Set();
  for (const workout of workouts) {
    const id = required(workout.workout_id, "訓練日 ID");
    if (workoutIds.has(id)) throw new Error("訓練日 ID 重複。");
    workoutIds.add(id);
    if (workout.plan_id !== planId) throw new Error("訓練日指向其他計畫。");
    const week = positiveInt(workout.week_number, "週次");
    const day = positiveInt(workout.day_number, "訓練日序號");
    if (week > weekCount || day > dayCount) throw new Error("訓練日超出課表範圍。");
    const slot = String(week) + ":" + String(day);
    if (daySlots.has(slot)) throw new Error("課表週次與訓練日重複。");
    daySlots.add(slot);
    if (!["planned", "not_provided"].includes(workout.status)) throw new Error("未知的訓練日狀態。");
    if (workout.planned_date && !/^\d{4}-\d{2}-\d{2}$/.test(workout.planned_date)) {
      throw new Error("預計訓練日期格式不正確。");
    }
  }
  const setIds = new Set();
  const itemSlots = new Set();
  const workoutStatuses = new Map(workouts.map((workout) => [workout.workout_id, workout.status]));
  for (const item of sets) {
    const id = required(item.planned_set_id, "動作 ID");
    if (setIds.has(id)) throw new Error("動作 ID 重複。");
    setIds.add(id);
    if (!workoutIds.has(item.workout_id)) throw new Error("動作指向不存在的訓練日。");
    if (workoutStatuses.get(item.workout_id) !== "planned") throw new Error("未提供的訓練日不能包含動作。");
    required(item.exercise_name, "動作名稱");
    const order = positiveInt(item.exercise_order, "動作順序");
    const slot = item.workout_id + ":" + order;
    if (itemSlots.has(slot)) throw new Error("同一訓練日的動作順序重複。");
    itemSlots.add(slot);
    validatePrescription(item);
  }
  return records;
}

function prescriptionFields(prefix, prescription = { kind: "unspecified" }) {
  const kind = prescription?.kind ?? "unspecified";
  if (prefix === "reps") {
    if (!REPS_KINDS.has(kind)) throw new Error("未知的次數格式。");
    return {
      reps_kind: kind,
      reps_value: kind === "fixed" ? prescription.value : "",
      reps_min: kind === "range" ? prescription.min : "",
      reps_max: kind === "range" ? prescription.max : "",
      reps_rpe: kind === "until_rpe" ? prescription.rpe : "",
      reps_raw: kind === "needs_review" ? prescription.raw : "",
    };
  }
  if (!LOAD_KINDS.has(kind)) throw new Error("未知的重量格式。");
  return {
    load_kind: kind,
    load_value: ["fixed", "bounded"].includes(kind) ? prescription.value : "",
    load_unit: ["fixed", "bounded"].includes(kind) ? prescription.unit : "",
    load_operator: kind === "bounded" ? prescription.operator : "",
    load_rpe: kind === "rpe_target" ? prescription.rpe : "",
    load_raw: kind === "needs_review" ? prescription.raw : "",
  };
}

// Import *prescriptions only*. Phase 0 actual fields are not historical Sessions/Sets;
// they are intentionally excluded rather than mistaken for performed workouts.
export function createTrainingPlanRecords(normalized, {
  title = "教練訓練課表",
  idFactory = () => crypto.randomUUID(),
  now = new Date().toISOString(),
} = {}) {
  if (normalized?.format !== "fitness-blog-coach-plan" || normalized.version !== 1
    || !Array.isArray(normalized.blocks) || normalized.blocks.length !== 1) {
    throw new Error("僅支援 Phase 0 單一 Block1 課表格式。");
  }
  const block = normalized.blocks[0];
  if (!Array.isArray(block.weeks) || !block.weeks.length) throw new Error("找不到課表週次。");
  const allWorkouts = block.weeks.flatMap((week) => week.workouts ?? []);
  if (!allWorkouts.length) throw new Error("找不到訓練日。");
  const planId = idFactory();
  const dayCount = Math.max(...allWorkouts.map((workout) => Number(workout.day)));
  const plan = {
    plan_id: planId, title, block_name: String(block.name ?? ""), week_count: Math.max(...block.weeks.map((w) => w.week)),
    day_count: dayCount, status: "draft", source_sheet: String(normalized.source?.sheet ?? block.name ?? ""),
    notes: "", created_at: now, updated_at: now, plan_schema_version: PLAN_SCHEMA_VERSION,
  };
  const workouts = [];
  const sets = [];
  for (const week of block.weeks) {
    for (const workout of week.workouts ?? []) {
      const workoutId = idFactory();
      const items = workout.items ?? [];
      workouts.push({
        workout_id: workoutId, plan_id: planId, week_number: week.week, day_number: workout.day,
        planned_date: "", title: "Week " + week.week + " · Day " + workout.day,
        status: items.length ? "planned" : "not_provided",
        notes: (week.notes ?? []).join("\n"), created_at: now, updated_at: now,
      });
      items.forEach((item, index) => {
        const p = item.planned ?? {};
        sets.push({
          planned_set_id: idFactory(), workout_id: workoutId,
          exercise_order: index + 1, exercise_name: String(item.name ?? ""), item_kind: item.kind,
          target_sets: p.sets ?? "",
          ...prescriptionFields("reps", p.reps),
          ...prescriptionFields("load", p.load),
          target_metric: p.target?.metric ?? "", target_minimum: p.target?.minimum ?? "",
          coach_notes: String(item.coachNotes ?? ""), source_row: item.source?.row ?? "",
          created_at: now, updated_at: now,
        });
      });
    }
  }
  const records = { plan, workouts, sets };
  return validateTrainingPlanRecords(records);
}
