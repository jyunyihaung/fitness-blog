import { normalizeExerciseName, sortExerciseSuggestions } from "./exercises.js";
import { attachPlanExercise, attachPlanSet, readPlanSet, togglePlanSet } from "./plan-editor-fields.js";

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

export function createWorkoutEditor(root, { completionEnabled = false, planMode = false } = {}) {
  let exerciseOptions = [];

  function setExerciseOptions(exercises = []) {
    exerciseOptions = sortExerciseSuggestions(exercises);
    const datalist = document.querySelector("[data-exercise-suggestions]");
    if (!datalist) return;
    datalist.replaceChildren(...exerciseOptions.map((exercise) => {
      const option = document.createElement("option");
      option.value = exercise.name;
      option.label = exercise.category;
      return option;
    }));
  }
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
    const initial = values ?? (previous ? (planMode ? readPlanSet(previous, readSet(previous)) : readSet(previous)) : {});
    setValues(set, initial, completionEnabled);
    if (planMode) attachPlanSet(set, exercise, initial);
    exercise.querySelector("[data-sets]").append(fragment);
    renumber();
  }

  function addExercise(values = null) {
    const fragment = exerciseTemplate.content.cloneNode(true);
    const exercise = fragment.querySelector("[data-exercise]");
    exercise.querySelector("[data-exercise-name]").value = values?.name ?? "";
    exercise.querySelector("[data-exercise-category]").value = values?.category ?? "accessory";
    if (planMode) attachPlanExercise(exercise, values);
    const sets = values?.sets?.length ? values.sets : [null];
    sets.forEach((set) => addSet(exercise, set));
    root.append(fragment);
    renumber();
    return exercise;
  }

  function load(exercises = []) {
    root.replaceChildren();
    if (exercises.length) exercises.forEach(addExercise);
    else if (!planMode) addExercise();
  }

  function read({ completedOnly = false } = {}) {
    return Array.from(root.querySelectorAll("[data-exercise]")).map((exercise) => ({
      ...(planMode ? { groupId: exercise.dataset.exerciseGroupId || "", planKind: exercise.querySelector("[data-plan-kind]").value } : {}),
      name: exercise.querySelector("[data-exercise-name]").value,
      category: exercise.querySelector("[data-exercise-category]").value,
      sets: Array.from(exercise.querySelectorAll("[data-set]"))
        .map((set) => planMode ? readPlanSet(set, readSet(set)) : readSet(set))
        .filter((set) => !completedOnly || set.completed),
    })).filter((exercise) => !completedOnly || exercise.sets.length > 0);
  }

  root.addEventListener("change", (event) => {
    if (!planMode || !event.target.matches("[data-plan-kind], [data-plan-reps-kind], [data-plan-load-kind]")) return;
    const exercise = event.target.closest("[data-exercise]");
    exercise.querySelectorAll("[data-set]").forEach((set) => togglePlanSet(set, exercise));
  });

  root.addEventListener("click", (event) => {
    const addSetButton = event.target.closest("[data-add-set]");
    if (addSetButton) return addSet(addSetButton.closest("[data-exercise]"));
    const removeSetButton = event.target.closest("[data-remove-set]");
    if (removeSetButton) removeSetButton.closest("[data-set]").remove();
    const removeExerciseButton = event.target.closest("[data-remove-exercise]");
    if (removeExerciseButton) removeExerciseButton.closest("[data-exercise]").remove();
    renumber();
  });

  function applyExerciseMatch(event) {
    if (!event.target.matches("[data-exercise-name]")) return;
    const match = exerciseOptions.find((exercise) => exercise.normalizedName === normalizeExerciseName(event.target.value));
    if (!match) return;
    event.target.value = match.name;
    event.target.closest("[data-exercise]").querySelector("[data-exercise-category]").value = match.category;
  }

  root.addEventListener("input", applyExerciseMatch);
  root.addEventListener("change", applyExerciseMatch);

  return { addExercise, load, read, setExerciseOptions };
}
