import { getWorkoutData } from "./data.js";
import { googleAuth } from "./auth-service.js";
import { getSelectedSpreadsheet } from "./preferences.js";

function appendText(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function formatSet(set, index) {
  const item = document.createElement("li");
  item.className = "record-set";

  appendText(item, "span", "record-set-number", `Set ${index + 1}`);
  const primary = document.createElement("div");
  primary.className = "record-set-primary";
  appendText(primary, "strong", "", `${set.weight === 0 ? "Bodyweight" : `${set.weight} kg`} × ${set.reps}`);
  if (set.rpe !== null) appendText(primary, "span", "record-set-meta", `RPE ${set.rpe}`);
  appendText(primary, "span", "record-set-meta", set.type || "working");
  if (set.isWarmup) appendText(primary, "span", "record-set-meta", "Warm-up");
  item.append(primary);

  if (set.notes) appendText(item, "p", "record-set-notes", set.notes);
  return item;
}

function renderExercise(exercise) {
  const section = document.createElement("section");
  section.className = "record-exercise";
  appendText(section, "h3", "record-exercise-title", exercise.name);
  if (exercise.sets.length === 0) {
    appendText(section, "p", "empty-state compact", "沒有組數紀錄。 ");
    return section;
  }
  const list = document.createElement("ol");
  list.className = "record-set-list";
  exercise.sets.forEach((set, index) => list.append(formatSet(set, index)));
  section.append(list);
  return section;
}

function renderSession(workout) {
  const details = document.createElement("details");
  details.className = "card record-session";
  const summary = document.createElement("summary");
  summary.className = "record-session-summary";

  const heading = document.createElement("div");
  appendText(heading, "span", "record-session-date", workout.date);
  appendText(heading, "strong", "record-session-title", workout.workout);
  summary.append(heading);
  appendText(summary, "span", "record-session-count", `${workout.exercises.length} exercises`);
  details.append(summary);

  const body = document.createElement("div");
  body.className = "record-session-body";
  if (workout.notes) appendText(body, "p", "record-session-notes", workout.notes);
  if (workout.exercises.length === 0) {
    appendText(body, "p", "empty-state compact", "這個 Session 沒有動作紀錄。");
  } else {
    workout.exercises.forEach((exercise) => body.append(renderExercise(exercise)));
  }
  details.append(body);
  return details;
}

function describeError(error) {
  if (error?.status === 401) return "Google 授權已過期，請回到 Dashboard 重新連線。";
  if (error?.status === 403) return "目前帳號沒有讀取這份 Google Sheet 的權限。";
  return error?.message || "無法讀取訓練紀錄。";
}

function setStatus(message, state = "idle") {
  const status = document.querySelector("[data-records-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
  status.hidden = false;
}

function renderRecords(workouts) {
  const output = document.querySelector("[data-records-output]");
  const status = document.querySelector("[data-records-status]");
  if (!output || !status) return;
  output.replaceChildren();
  if (workouts.length === 0) {
    setStatus("目前沒有訓練紀錄。", "empty");
    return;
  }
  status.hidden = true;
  workouts.forEach((workout) => output.append(renderSession(workout)));
}

async function loadRecords() {
  setStatus("正在讀取訓練紀錄…", "loading");
  const selected = getSelectedSpreadsheet();
  const publicSpreadsheetId = window.FitnessConfig?.googleSheets?.spreadsheetId?.trim();
  const spreadsheetId = selected?.id || publicSpreadsheetId;
  if (!spreadsheetId) {
    setStatus("尚未選擇 Google Sheet。請先回到 Dashboard 連接訓練資料。", "empty");
    return;
  }

  try {
    const accessToken = selected?.id ? googleAuth.getValidAccessToken() : null;
    if (selected?.id && !accessToken) {
      setStatus("Google 授權尚未建立或已過期，請回到 Dashboard 重新連線。", "authorization-error");
      return;
    }
    renderRecords(await getWorkoutData({ spreadsheetId, accessToken }));
  } catch (error) {
    console.error("Unable to load record list.", error);
    setStatus(describeError(error), "error");
  }
}

window.addEventListener("fitness:route-change", (event) => {
  if (event.detail.route === "/records") loadRecords();
});

window.addEventListener("fitness:data-changed", () => {
  if (window.location.hash === "#/records") loadRecords();
});
