function toDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function toMonthKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function toYearKey(date) {
  return String(date.getFullYear());
}

function toWeekKey(date) {
  const day = date.getDay() || 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - day + 1);
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function calculateWorkoutVolume(workout) {
  return (workout.exercises ?? []).reduce((workoutTotal, exercise) => {
    const exerciseTotal = (exercise.sets ?? []).reduce((setTotal, set) => {
      return setTotal + toNumber(set.weight) * toNumber(set.reps);
    }, 0);

    return workoutTotal + exerciseTotal;
  }, 0);
}

function normalizeWorkout(workout) {
  const date = toDate(workout.date);

  return {
    date,
    duration: toNumber(workout.duration),
    exercises: workout.exercises ?? [],
    volume: calculateWorkoutVolume(workout),
  };
}

function groupMetric(workouts, keyFn, valueFn) {
  return workouts.reduce((groups, workout) => {
    if (!workout.date) {
      return groups;
    }

    const key = keyFn(workout.date);
    groups.set(key, (groups.get(key) ?? 0) + valueFn(workout));
    return groups;
  }, new Map());
}

function toChartDataset(label, groupedValues) {
  const labels = Array.from(groupedValues.keys()).sort();

  return {
    labels,
    datasets: [
      {
        label,
        data: labels.map((key) => groupedValues.get(key)),
      },
    ],
  };
}

function buildVolumeDataset(workouts, label, keyFn) {
  return toChartDataset(
    label,
    groupMetric(workouts, keyFn, (workout) => workout.volume)
  );
}

function buildExerciseFrequencyDataset(workouts) {
  const frequency = workouts.reduce((groups, workout) => {
    workout.exercises.forEach((exercise) => {
      const name = exercise.name ?? "Unknown exercise";
      groups.set(name, (groups.get(name) ?? 0) + 1);
    });

    return groups;
  }, new Map());

  return toChartDataset("Exercise Frequency", frequency);
}

function calculateAverageWorkoutDuration(workouts) {
  const durations = workouts
    .map((workout) => workout.duration)
    .filter((duration) => duration > 0);

  if (durations.length === 0) {
    return 0;
  }

  const total = durations.reduce((sum, duration) => sum + duration, 0);
  return Math.round((total / durations.length) * 10) / 10;
}

export function createStatistics(workouts) {
  const sourceWorkouts = Array.isArray(workouts) ? workouts : [];
  const normalizedWorkouts = sourceWorkouts.map(normalizeWorkout);

  return {
    charts: {
      weeklyVolume: buildVolumeDataset(normalizedWorkouts, "Weekly Volume", toWeekKey),
      monthlyVolume: buildVolumeDataset(normalizedWorkouts, "Monthly Volume", toMonthKey),
      yearlyVolume: buildVolumeDataset(normalizedWorkouts, "Yearly Volume", toYearKey),
      exerciseFrequency: buildExerciseFrequencyDataset(normalizedWorkouts),
    },
    metrics: {
      averageWorkoutDuration: calculateAverageWorkoutDuration(normalizedWorkouts),
      trainingCount: normalizedWorkouts.length,
    },
  };
}
