import { getWorkoutData } from "./data.js";
import { createStatistics } from "./stats.js";
import { renderCharts } from "./charts.js";
import { GoogleOAuthClient } from "./oauth.js";
import { createTrainingSpreadsheet, pickSpreadsheet, validateSpreadsheet } from "./google-sheets.js";
import { getSelectedSpreadsheet, saveSelectedSpreadsheet } from "./preferences.js";

let activeCharts = [];

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

function setAppVisible(visible) {
  document.querySelector("[data-setup]").hidden = visible;
  document.querySelectorAll("[data-app-content]").forEach((section) => {
    section.hidden = !visible;
  });
}

function setSetupStatus(message, state = "idle") {
  const output = document.querySelector("[data-setup-status]");
  output.textContent = message;
  output.dataset.state = state;
}

function setSetupBusy(busy, activeButton = null) {
  document.querySelectorAll("[data-setup] button").forEach((button) => {
    button.disabled = busy;
  });
  if (busy && activeButton) activeButton.dataset.originalText = activeButton.textContent;
}

function finishSetupOperation(activeButton) {
  setSetupBusy(false);
  if (activeButton?.dataset.originalText) {
    activeButton.textContent = activeButton.dataset.originalText;
    delete activeButton.dataset.originalText;
  }
}

async function loadDashboard(spreadsheet, accessToken) {
  const workouts = await getWorkoutData({ spreadsheetId: spreadsheet.id, accessToken });
  const statistics = createStatistics(workouts);
  activeCharts.forEach((chart) => chart.destroy());
  activeCharts = [];
  renderWorkouts(workouts);
  renderStatistics(statistics);
  setAppVisible(true);
  activeCharts = renderCharts(statistics);
  document.documentElement.dataset.ready = "true";
}

function describeError(error) {
  if (error?.name === "AbortError") return "操作已取消，你可以重新選擇。";
  if (error?.status === 401) return "Google 授權已過期，請重新連線。";
  if (error?.status === 403) return "目前帳號沒有存取此檔案的權限。";
  return error?.message || "無法完成 Google Sheets 設定。";
}

async function runSetupOperation(button, workingText, operation) {
  setSetupBusy(true, button);
  button.textContent = workingText;
  setSetupStatus(workingText);
  try {
    await operation();
  } catch (error) {
    console.error("Google Sheets setup failed.", error);
    setSetupStatus(describeError(error), error?.name === "AbortError" ? "idle" : "error");
    document.documentElement.dataset.ready = "error";
  } finally {
    finishSetupOperation(button);
  }
}

async function initializeOAuthSetup() {
  const config = window.FitnessConfig?.googleSheets ?? {};
  const oauth = new GoogleOAuthClient(config.oauthClientId);
  const selectButton = document.querySelector("[data-select-sheet]");
  const createButton = document.querySelector("[data-create-sheet]");
  const reconnectButton = document.querySelector("[data-reconnect-sheet]");
  const selected = getSelectedSpreadsheet();

  if (!config.oauthClientId?.trim()) {
    setSetupBusy(true);
    setSetupStatus("網站尚未完成 Google OAuth 設定，請聯絡網站管理者。", "error");
    document.documentElement.dataset.ready = "configuration-error";
    return false;
  }

  setSetupBusy(true);
  setSetupStatus("正在準備 Google 授權…");
  try {
    // Load GIS before a user gesture so mobile browsers do not block the
    // authorization popup while waiting for a remote script to download.
    await oauth.initialize();
  } catch (error) {
    setSetupStatus(describeError(error), "error");
    document.documentElement.dataset.ready = "configuration-error";
    return false;
  }
  setSetupBusy(false);

  if (selected) {
    reconnectButton.hidden = false;
    setSetupStatus(`已選擇：${selected.name}。請重新連線以讀取私人資料。`);
  }

  selectButton.addEventListener("click", () => runSetupOperation(selectButton, "正在開啟 Google Picker…", async () => {
    const accessToken = await oauth.requestAccessToken();
    const picked = await pickSpreadsheet({
      accessToken,
      apiKey: config.pickerApiKey,
      appId: config.pickerAppId,
    });
    const spreadsheet = await validateSpreadsheet(picked.id, accessToken);
    saveSelectedSpreadsheet({ ...spreadsheet, name: picked.name || spreadsheet.name });
    await loadDashboard(spreadsheet, accessToken);
  }));

  createButton.addEventListener("click", () => runSetupOperation(createButton, "正在建立 Google Sheet…", async () => {
    const accessToken = await oauth.requestAccessToken();
    const spreadsheet = await createTrainingSpreadsheet(accessToken);
    saveSelectedSpreadsheet(spreadsheet);
    await loadDashboard(spreadsheet, accessToken);
  }));

  reconnectButton.addEventListener("click", () => runSetupOperation(reconnectButton, "正在重新連線…", async () => {
    const current = getSelectedSpreadsheet();
    if (!current) throw new Error("找不到已選擇的 Google Sheet。請重新選擇檔案。");
    const accessToken = await oauth.requestAccessToken();
    const spreadsheet = await validateSpreadsheet(current.id, accessToken);
    await loadDashboard(spreadsheet, accessToken);
  }));
  return true;
}

async function initializeApp() {
  setAppVisible(false);
  const oauthReady = await initializeOAuthSetup();

  const publicSpreadsheetId = window.FitnessConfig?.googleSheets?.spreadsheetId?.trim();
  if (!publicSpreadsheetId) {
    if (oauthReady) document.documentElement.dataset.ready = "setup";
    return;
  }

  try {
    await loadDashboard({ id: publicSpreadsheetId }, null);
  } catch (error) {
    console.error("Unable to load workout data.", error);
    setAppVisible(false);
    setSetupStatus(`預設試算表無法載入：${describeError(error)}`, "error");
    document.documentElement.dataset.ready = "error";
  }
}

if (document.readyState !== "loading") initializeApp();
else document.addEventListener("DOMContentLoaded", initializeApp);
