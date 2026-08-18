import { getWorkoutData } from "./data.js";
import { createStatistics } from "./stats.js";
import { renderCharts } from "./charts.js";

function appendTextElement(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function renderExercise(exercise) {
  const section = document.createElement("section");
  section.className = "exercise";
  appendTextElement(section, "h4", "", exercise.name);
  if (exercise.sets.length === 0) {
    appendTextElement(section, "p", "empty-state compact", "No sets recorded.");
    return section;
  }
  const list = document.createElement("ol");
  list.className = "set-list";
  list.setAttribute("aria-label", `${exercise.name} sets`);
  exercise.sets.forEach((set, index) => {
    const item = document.createElement("li");
    appendTextElement(item, "span", "", `Set ${index + 1}`);
    const weight = set.weight === 0 ? "Bodyweight" : `${set.weight} kg`;
    appendTextElement(item, "strong", "", `${weight} × ${set.reps}`);
    list.append(item);
  });
  section.append(list);
  return section;
}

function renderWorkout(workout) {
  const article = document.createElement("article");
  article.className = "card workout-card";
  article.setAttribute("role", "listitem");
  const header = document.createElement("header");
  header.className = "workout-card-header";
  const heading = document.createElement("div");
  const dateLine = appendTextElement(heading, "p", "workout-date", "");
  const time = document.createElement("time");
  time.dateTime = workout.date;
  time.textContent = workout.date;
  dateLine.append(time);
  appendTextElement(heading, "h3", "workout-title", workout.workout);
  header.append(heading);
  if (workout.duration > 0) appendTextElement(header, "p", "workout-duration", `${workout.duration} min`);
  article.append(header);
  if (workout.notes) appendTextElement(article, "p", "workout-notes", workout.notes);
  if (workout.exercises.length === 0) {
    appendTextElement(article, "p", "empty-state compact", "No exercises recorded.");
  } else {
    const exercises = document.createElement("div");
    exercises.className = "exercise-list";
    workout.exercises.forEach((exercise) => exercises.append(renderExercise(exercise)));
    article.append(exercises);
  }
  return article;
}

function renderWorkouts(workouts) {
  const output = document.querySelector("[data-workouts-output]");
  if (!output) return;
  output.replaceChildren();
  if (workouts.length === 0) {
    appendTextElement(output, "p", "empty-state", "No workouts have been logged yet.");
    return;
  }
  workouts.forEach((workout) => output.append(renderWorkout(workout)));
}

function renderStatistics(statistics) {
  const output = document.querySelector("[data-statistics-output]");
  if (output) output.textContent = JSON.stringify(statistics, null, 2);
  window.FitnessStats = statistics;
}

function renderError(error) {
  const output = document.querySelector("[data-workouts-output]");
  if (output) {
    output.replaceChildren();
    appendTextElement(output, "p", "empty-state data-error", error.message);
  }
  renderStatistics(createStatistics([]));
}

async function initializeApp() {
  try {
    const workouts = await getWorkoutData();
    const statistics = createStatistics(workouts);
    renderWorkouts(workouts);
    renderStatistics(statistics);
    renderCharts(statistics);
    document.documentElement.dataset.ready = "true";
  } catch (error) {
    console.error("Unable to load workout data.", error);
    renderError(error);
    document.documentElement.dataset.ready = "error";
  }
}

if (document.readyState !== "loading") initializeApp();
else document.addEventListener("DOMContentLoaded", initializeApp);
