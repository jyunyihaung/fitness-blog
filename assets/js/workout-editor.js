const exerciseTemplate = document.querySelector("[data-exercise-template]");
const setTemplate = document.querySelector("[data-set-template]");

function setValues(set, values = {}, completionEnabled = false) {
  set.querySelector("[data-set-weight]").value = values.weightKg ?? "0";
  set.querySelector("[data-set-reps]").value = values.reps ?? "1";
  set.querySelector("[data-set-rpe]").value = values.rpe ?? "";
  set.querySelector("[data-set-type]").value = values.type ?? "working";
  set.querySelector("[data-set-warmup]").checked = Boolean(values.isWarmup);
  set.querySelector("[data-set-notes]").value = values.notes ?? "";
  set.querySelector("[data-completion-field]").hidden = !completionEnabled;
  set.querySelector("[data-set-completed]").checked = completionEnabled && Boolean(values.completed);
}

function readSet(set) {
  return {
    weightKg: set.querySelector("[data-set-weight]").value,
    reps: set.querySelector("[data-set-reps]").value,
    rpe: set.querySelector("[data-set-rpe]").value,
    type: set.querySelector("[data-set-type]").value,
    isWarmup: set.querySelector("[data-set-warmup]").checked,
    notes: set.querySelector("[data-set-notes]").value,
    completed: set.querySelector("[data-set-completed]").checked,
  };
}

export function createWorkoutEditor(root, { completionEnabled = false } = {}) {
  function renumber() {
    root.querySelectorAll("[data-exercise]").forEach((exercise, exerciseIndex) => {
      exercise.querySelector("[data-exercise-number]").textContent = String(exerciseIndex + 1);
      exercise.querySelectorAll("[data-set]").forEach((set, setIndex) => {
        set.querySelector("[data-set-number]").textContent = String(setIndex + 1);
      });
    });
  }

  function addSet(exercise, values = null) {
    const previous = exercise.querySelector("[data-set]:last-child");
    const fragment = setTemplate.content.cloneNode(true);
    const set = fragment.querySelector("[data-set]");
    setValues(set, values ?? (previous ? readSet(previous) : {}), completionEnabled);
    exercise.querySelector("[data-sets]").append(fragment);
    renumber();
  }

  function addExercise(values = null) {
    const fragment = exerciseTemplate.content.cloneNode(true);
    const exercise = fragment.querySelector("[data-exercise]");
    exercise.querySelector("[data-exercise-name]").value = values?.name ?? "";
    exercise.querySelector("[data-exercise-category]").value = values?.category ?? "accessory";
    const sets = values?.sets?.length ? values.sets : [null];
    sets.forEach((set) => addSet(exercise, set));
    root.append(fragment);
    renumber();
    return exercise;
  }

  function load(exercises = []) {
    root.replaceChildren();
    if (exercises.length) exercises.forEach(addExercise);
    else addExercise();
  }

  function read({ completedOnly = false } = {}) {
    return Array.from(root.querySelectorAll("[data-exercise]")).map((exercise) => ({
      name: exercise.querySelector("[data-exercise-name]").value,
      category: exercise.querySelector("[data-exercise-category]").value,
      sets: Array.from(exercise.querySelectorAll("[data-set]"))
        .map(readSet)
        .filter((set) => !completedOnly || set.completed),
    })).filter((exercise) => !completedOnly || exercise.sets.length > 0);
  }

  root.addEventListener("click", (event) => {
    const addSetButton = event.target.closest("[data-add-set]");
    if (addSetButton) return addSet(addSetButton.closest("[data-exercise]"));
    const removeSetButton = event.target.closest("[data-remove-set]");
    if (removeSetButton) removeSetButton.closest("[data-set]").remove();
    const removeExerciseButton = event.target.closest("[data-remove-exercise]");
    if (removeExerciseButton) removeExerciseButton.closest("[data-exercise]").remove();
    renumber();
  });

  return { addExercise, load, read };
}
