function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function calculateEstimatedOneRepMax(weight, reps) {
  const normalizedWeight = finitePositive(weight);
  const normalizedReps = Number(reps);
  if (!normalizedWeight || !Number.isInteger(normalizedReps) || normalizedReps < 1 || normalizedReps > 12) return 0;
  const estimate = normalizedReps === 1
    ? normalizedWeight
    : normalizedWeight * (1 + normalizedReps / 30);
  return Math.round(estimate * 10) / 10;
}

function liftSets(workouts, lift) {
  return (workouts ?? []).flatMap((workout) => (workout.exercises ?? [])
    .filter((exercise) => exercise.category === lift)
    .flatMap((exercise) => exercise.sets ?? []))
    .filter((set) => !set.isWarmup && set.type !== "warmup");
}

export function findBestSingle(workouts, lift) {
  return liftSets(workouts, lift).reduce((best, set) => {
    return Number(set.reps) === 1 ? Math.max(best, finitePositive(set.weight)) : best;
  }, 0);
}

export function findBestEstimatedOneRepMax(workouts, lift) {
  return liftSets(workouts, lift).reduce((best, set) => {
    return Math.max(best, calculateEstimatedOneRepMax(set.weight, Number(set.reps)));
  }, 0);
}

export function resolveReferenceOneRepMax({ lift, goals = [], workouts = [], manualOneRepMax = 0 }) {
  const currentGoal = goals.find((goal) => goal.lift === lift);
  const currentWeight = finitePositive(currentGoal?.currentWeightKg);
  if (currentWeight) return { value: currentWeight, source: "goal-current" };

  const bestSingle = findBestSingle(workouts, lift);
  if (bestSingle) return { value: bestSingle, source: "best-single" };

  const estimated = findBestEstimatedOneRepMax(workouts, lift);
  if (estimated) return { value: estimated, source: "estimated" };

  const manual = finitePositive(manualOneRepMax);
  if (manual) return { value: manual, source: "manual" };
  return null;
}
