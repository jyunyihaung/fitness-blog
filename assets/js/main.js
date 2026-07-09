import { getWorkoutData } from "./data.js";
import { createStatistics } from "./stats.js";
import { renderCharts } from "./charts.js";

function renderStatistics(statistics) {
  const output = document.querySelector("[data-statistics-output]");

  if (output) {
    output.textContent = JSON.stringify(statistics, null, 2);
  }

  window.FitnessStats = statistics;
}

function initializeApp() {
  const workouts = getWorkoutData();
  const statistics = createStatistics(workouts);

  document.documentElement.dataset.ready = "true";
  renderStatistics(statistics);
  renderCharts(statistics);
}

if (document.readyState !== "loading") {
  initializeApp();
} else {
  document.addEventListener("DOMContentLoaded", initializeApp);
}
