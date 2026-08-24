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
    goal: "提升最大力量與 1RM / 3RM 表現。",
    rest: "3–5+ 分鐘；下一組開始前應確認呼吸、力量與專注度已大致恢復。",
    shortTip: "穩定完成高品質重複，保留 1–3 下餘力，不需每組做到力竭。",
    tips: [
      "每一下都以穩定、完整的動作完成，不要為了完成重量犧牲姿勢。",
      "動作開始前做好核心與全身張力，重視起始姿勢與動作路徑。",
      "每組保留約 1–3 下餘力，主要工作組建議約 RPE 7–9。",
      "高重量下動作速度變慢是正常現象，但不應出現明顯失控或姿勢崩壞。",
      "若原本目標次數無法完成，或動作品質明顯下降，應降低重量。",
      "不需要每次訓練做到力竭或測試 1RM。",
    ],
    warning: { maxReps: 8, message: "目前次數較高，訓練刺激可能逐漸偏向肌肥大或肌耐力。" },
  },
  hypertrophy: {
    id: "hypertrophy", label: "肌肥大", englishLabel: "Hypertrophy",
    intensityRange: [0.65, 0.8], repsRange: [6, 12], setsRange: [3, 5], rpeRange: [7, 9],
    preset: { intensity: 0.7, reps: 8, sets: 4, rpe: 8 },
    goal: "增加肌肉量與肌肉截面積。",
    rest: "約 1–3 分鐘；複合動作可以適度延長休息。",
    shortTip: "控制動作並接近力竭，保留約 0–3 下餘力，優先維持完整動作範圍。",
    tips: [
      "使用可以控制全程動作的重量，避免單純利用慣性完成次數。",
      "重視完整活動範圍與目標肌群受力。",
      "每組逐漸接近力竭，通常保留約 0–3 下餘力。",
      "不需要每組都做到完全力竭；大部分工作組維持 RPE 7–9 即可。",
      "最後幾下速度變慢屬正常現象，但仍需保持動作品質。",
      "如果達到目標 reps 後仍非常輕鬆，可以考慮增加重量；如果無法達到最低 reps，則降低重量。",
    ],
    warning: { maxIntensity: 0.85, maxRepsAtIntensity: 5, message: "目前設定較偏向最大肌力訓練。" },
  },
  strengthHypertrophy: {
    id: "strengthHypertrophy", label: "力量＋肌肥大", englishLabel: "Strength + Hypertrophy",
    intensityRange: [0.7, 0.85], repsRange: [4, 8], setsRange: [3, 5], rpeRange: [7, 9],
    preset: { intensity: 0.75, reps: 5, sets: 4, rpe: 8 },
    goal: "同時累積力量與肌肉量。",
    rest: "約 2–4 分鐘。",
    shortTip: "兼顧重量與訓練量；保持主項技術，保留約 1–3 下餘力。",
    tips: [
      "使用中高重量，兼顧負重與訓練量。",
      "每一下維持與力量訓練相同的穩定技術。",
      "工作組通常保留約 1–3 下餘力。",
      "不需要像最大肌力訓練一樣頻繁接觸極高重量，也不要為追求肌肥大而讓主項每組都做到完全力竭。",
      "如果所有組數與 reps 都能穩定完成，可以逐步增加重量。",
      "如果後段組數動作明顯惡化，優先降低重量而不是強行完成。",
    ],
  },
  volume: {
    id: "volume", label: "容量與技術", englishLabel: "Volume / Technique",
    intensityRange: [0.55, 0.7], repsRange: [3, 8], setsRange: [5, 8], rpeRange: [5, 8],
    preset: { intensity: 0.65, reps: 5, sets: 5, rpe: 6 },
    goal: "累積訓練量、增加動作熟練度並練習穩定技術。",
    rest: "約 1.5–3 分鐘，依恢復程度調整。",
    shortTip: "不要追求力竭；用一致、高品質的動作累積訓練量。",
    tips: [
      "每一組都應保持高品質、可重複的動作。",
      "重點不是單組做到很累，而是累積大量品質良好的 repetitions。",
      "每組保留較多餘力，通常約 RPE 5–8。",
      "每一下盡量使用相同的起始位置、節奏與動作路徑。",
      "不要因重量較輕就隨意加快或忽略動作控制。",
      "後段組數如果技術開始明顯改變，應降低重量或停止增加訓練量。",
      "適合作為技術日、輕量日或主項額外訓練量。",
    ],
  },
  endurance: {
    id: "endurance", label: "肌耐力", englishLabel: "Muscular Endurance",
    intensityRange: [0.4, 0.6], repsRange: [12, 20], setsRange: [2, 4], rpeRange: [7, 9],
    preset: { intensity: 0.5, reps: 15, sets: 3, rpe: 8 },
    goal: "提升肌肉長時間或反覆輸出的能力。",
    rest: "約 30–90 秒；大型複合動作可依需要增加休息。",
    shortTip: "維持穩定節奏完成高次數；疲勞可以增加，但動作品質不能失控。",
    tips: [
      "使用較輕重量完成較高 repetitions。",
      "保持穩定節奏，不要一開始就過快消耗體力。",
      "高 reps 後段出現肌肉疲勞與灼熱感是正常現象。",
      "疲勞增加時仍應維持安全且可控制的動作。",
      "不要為了完成指定 reps 而使用大量慣性或明顯縮短動作範圍。",
      "如果因心肺或局部疲勞導致姿勢無法維持，應停止該組。",
      "可以透過增加 reps、縮短合理休息時間或小幅增加重量漸進。",
    ],
  },
  power: {
    id: "power", label: "爆發力", englishLabel: "Power / Speed",
    intensityRange: [0.5, 0.7], repsRange: [2, 5], setsRange: [4, 8], rpeRange: [0, 7],
    preset: { intensity: 0.6, reps: 3, sets: 6, rpe: 7 },
    goal: "提升動作速度、爆發力與快速力量輸出能力。",
    rest: "約 2–5 分鐘，確保下一組能恢復足夠的爆發輸出能力。",
    shortTip: "每一下都快速、有爆發意圖；速度明顯下降就停止該組。",
    tips: [
      "每一下都要有最大加速意圖。",
      "重點是速度與輸出品質，不是做到疲勞或力竭。",
      "每組 reps 保持較低，避免疲勞造成速度下降。",
      "即使重量較輕，也應保持完整的起始準備、核心穩定與動作控制。",
      "如果槓鈴速度明顯下降，應結束該組，而不是繼續完成更多 reps。",
      "如果連續幾組速度都明顯下降，可以延長休息或降低重量。",
      "不要把 Speed Training 做成高 reps 肌耐力訓練；通常維持 RPE ≤ 7。",
    ],
    warning: { maxReps: 5, message: "爆發力訓練應優先維持動作速度；過多 reps 可能因疲勞降低輸出速度。" },
  },
};

export function getTrainingModeWarnings(modeId, exercises, referenceOneRepMax) {
  const warning = TRAINING_MODES[modeId]?.warning;
  if (!warning) return [];
  const sets = (exercises ?? []).flatMap((exercise) => exercise.sets ?? []);
  const hasHighReps = warning.maxReps && sets.some((set) => Number(set.reps) > warning.maxReps);
  const hasStrengthBias = warning.maxIntensity && sets.some((set) => {
    const intensity = Number(set.weightKg) / Number(referenceOneRepMax);
    return Number(set.reps) <= warning.maxRepsAtIntensity && intensity >= warning.maxIntensity;
  });
  return hasHighReps || hasStrengthBias ? [warning.message] : [];
}

export function createQuickAddShareInput(draft, exercises, durationMinutes) {
  const mode = TRAINING_MODES[draft?.quickAdd?.modeId];
  if (!mode) throw new Error("請先產生有效的訓練建議。");
  const cleanExercises = (exercises ?? []).map((exercise) => ({
    name: exercise.name,
    category: exercise.category,
    sets: (exercise.sets ?? []).map((set) => ({
      weightKg: set.weightKg,
      reps: set.reps,
      rpe: set.rpe,
      type: set.type,
      isWarmup: set.isWarmup,
      notes: set.notes,
    })),
  }));
  const warnings = getTrainingModeWarnings(draft.quickAdd.modeId, cleanExercises, draft.quickAdd.referenceOneRepMax);
  const rpe = mode.rpeRange[0] === 0 ? `RPE ≤ ${mode.rpeRange[1]}` : `RPE ${mode.rpeRange.join("–")}`;
  const notes = [
    `訓練模式：${mode.englishLabel} / ${mode.label}`,
    `訓練目的：${mode.goal}`,
    `目標強度：${rpe}`,
    `組間休息：${mode.rest}`,
    `動作要點：${mode.shortTip}`,
    ...mode.tips.map((tip) => `・${tip}`),
    ...warnings.map((warning) => `目前設定提醒：${warning}`),
  ].join("\n");
  return {
    trainingDate: draft.trainingDate,
    title: draft.title,
    durationMinutes: String(durationMinutes ?? draft.durationMinutes ?? ""),
    notes,
    exercises: cleanExercises,
  };
}

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
