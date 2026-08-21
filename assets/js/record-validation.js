const SET_TYPES = new Set(["warmup", "working", "backoff", "top", "amrap"]);
const EXERCISE_CATEGORIES = new Set(["squat", "bench", "deadlift", "accessory"]);

function isFiniteNumber(value) {
  return value !== "" && Number.isFinite(Number(value));
}

function isStep(value, step) {
  return Math.abs(Number(value) / step - Math.round(Number(value) / step)) < Number.EPSILON * 10;
}

export function validateWorkoutInput(input) {
  const errors = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.trainingDate)) errors.push("請選擇有效的訓練日期。");
  if (!input.title.trim()) errors.push("請輸入訓練名稱。");

  if (input.durationMinutes !== "" && (!Number.isInteger(Number(input.durationMinutes)) || Number(input.durationMinutes) < 1)) {
    errors.push("訓練時間必須是大於 0 的整數。");
  }
  if (!Array.isArray(input.exercises) || input.exercises.length === 0) {
    errors.push("請至少新增一個訓練動作。");
    return errors;
  }

  input.exercises.forEach((exercise, exerciseIndex) => {
    const label = `動作 ${exerciseIndex + 1}`;
    if (!exercise.name.trim()) errors.push(`${label}：請輸入動作名稱。`);
    if (!EXERCISE_CATEGORIES.has(exercise.category)) errors.push(`${label}：動作分類無效。`);
    if (!Array.isArray(exercise.sets) || exercise.sets.length === 0) {
      errors.push(`${label}：請至少新增一組。`);
      return;
    }

    exercise.sets.forEach((set, setIndex) => {
      const setLabel = `${label}第 ${setIndex + 1} 組`;
      if (!isFiniteNumber(set.weightKg) || Number(set.weightKg) < 0 || !isStep(set.weightKg, 0.5)) {
        errors.push(`${setLabel}：重量必須大於或等於 0，並以 0.5 kg 為單位。`);
      }
      if (!Number.isInteger(Number(set.reps)) || Number(set.reps) < 1) {
        errors.push(`${setLabel}：次數必須是大於 0 的整數。`);
      }
      if (set.rpe !== "" && (!isFiniteNumber(set.rpe) || Number(set.rpe) < 1 || Number(set.rpe) > 10 || !isStep(set.rpe, 0.5))) {
        errors.push(`${setLabel}：RPE 必須介於 1–10，並以 0.5 為單位。`);
      }
      if (!SET_TYPES.has(set.type)) errors.push(`${setLabel}：組別類型無效。`);
    });
  });
  return errors;
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function createWorkoutRecords(input) {
  const sessionId = createId();
  const now = new Date().toISOString();
  const session = {
    session_id: sessionId,
    started_at: "",
    ended_at: "",
    training_date: input.trainingDate,
    title: input.title.trim(),
    body_weight_kg: "",
    duration_minutes: input.durationMinutes,
    notes: "",
    created_at: now,
    updated_at: now,
    schema_version: "1",
  };
  const sets = input.exercises.flatMap((exercise) => exercise.sets.map((set, setIndex) => ({
    set_id: createId(),
    session_id: sessionId,
    exercise_name: exercise.name.trim(),
    exercise_category: exercise.category,
    set_order: String(setIndex + 1),
    weight_kg: String(Number(set.weightKg)),
    reps: String(Number(set.reps)),
    rpe: set.rpe === "" ? "" : String(Number(set.rpe)),
    is_warmup: String(set.isWarmup || set.type === "warmup"),
    set_type: set.type,
    notes: String(set.notes ?? "").trim(),
    created_at: now,
    updated_at: now,
  })));
  return { session, sets };
}
