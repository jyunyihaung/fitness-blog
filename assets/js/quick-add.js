export const QUICK_ADD_LIFTS = {
  squat: { id: "squat", name: "Squat", label: "深蹲" },
  bench: { id: "bench", name: "Bench Press", label: "臥推" },
  deadlift: { id: "deadlift", name: "Deadlift", label: "硬舉" },
};

export const TRAINING_MODES = {
  strength: {
    id: "strength", label: "最大肌力", englishLabel: "Strength",
    intensityRange: [0.8, 0.9], repsRange: [2, 5], setsRange: [3, 5], rpeRange: [7, 9],
    preset: { intensity: 0.85, reps: 3, sets: 4, rpe: 8 },
  },
  hypertrophy: {
    id: "hypertrophy", label: "肌肥大", englishLabel: "Hypertrophy",
    intensityRange: [0.65, 0.8], repsRange: [6, 12], setsRange: [3, 5], rpeRange: [7, 9],
    preset: { intensity: 0.7, reps: 8, sets: 4, rpe: 8 },
  },
  strengthHypertrophy: {
    id: "strengthHypertrophy", label: "力量＋肌肥大", englishLabel: "Strength + Hypertrophy",
    intensityRange: [0.7, 0.85], repsRange: [4, 8], setsRange: [3, 5], rpeRange: [7, 9],
    preset: { intensity: 0.75, reps: 5, sets: 4, rpe: 8 },
  },
  volume: {
    id: "volume", label: "容量與技術", englishLabel: "Volume / Technique",
    intensityRange: [0.55, 0.7], repsRange: [3, 8], setsRange: [5, 8], rpeRange: [5, 8],
    preset: { intensity: 0.65, reps: 5, sets: 5, rpe: 6 },
  },
  endurance: {
    id: "endurance", label: "肌耐力", englishLabel: "Muscular Endurance",
    intensityRange: [0.4, 0.6], repsRange: [12, 20], setsRange: [2, 4], rpeRange: [7, 9],
    preset: { intensity: 0.5, reps: 15, sets: 3, rpe: 8 },
  },
  power: {
    id: "power", label: "爆發力", englishLabel: "Power / Speed",
    intensityRange: [0.5, 0.7], repsRange: [2, 5], setsRange: [4, 8], rpeRange: [0, 7],
    preset: { intensity: 0.6, reps: 3, sets: 6, rpe: 7 },
  },
};

export function roundWeight(weight, increment = 0.5) {
  const number = Number(weight);
  const step = Number(increment);
  if (!Number.isFinite(number) || number < 0 || !Number.isFinite(step) || step <= 0) return null;
  return Math.round(number / step) * step;
}

export function generateQuickAddDraft({ liftId, modeId, referenceOneRepMax, trainingDate, durationMinutes = "5" }) {
  const lift = QUICK_ADD_LIFTS[liftId];
  const mode = TRAINING_MODES[modeId];
  const reference = Number(referenceOneRepMax);
  if (!lift) throw new Error("請選擇有效的健力項目。");
  if (!mode) throw new Error("請選擇有效的訓練模式。");
  if (!Number.isFinite(reference) || reference <= 0) throw new Error("請提供大於 0 的參考 1RM。");
  const { intensity, reps, sets, rpe } = mode.preset;
  if (!Number.isFinite(intensity) || intensity <= 0 || intensity > 1) throw new Error("訓練強度設定無效。");
  if (!Number.isInteger(reps) || reps < 1) throw new Error("訓練次數設定無效。");
  if (!Number.isInteger(sets) || sets < 1) throw new Error("訓練組數設定無效。");
  const weight = roundWeight(reference * intensity);
  if (weight === null || !Number.isFinite(weight)) throw new Error("無法計算建議重量。");

  return {
    trainingDate,
    title: `${lift.name} · ${mode.englishLabel}`,
    durationMinutes: String(durationMinutes),
    quickAdd: { liftId, modeId, referenceOneRepMax: reference, intensity, weight },
    exercises: [{
      name: lift.name,
      category: lift.id,
      sets: Array.from({ length: sets }, () => ({
        weightKg: String(weight),
        reps: String(reps),
        rpe: String(rpe),
        type: "working",
        isWarmup: false,
        notes: "",
      })),
    }],
  };
}
