import { getWorkoutData } from "./data.js";
import { googleAuth } from "./auth-service.js";
import { getSelectedSpreadsheet } from "./preferences.js";
import { appState } from "./app-state.js";
import { deleteWorkoutRecord } from "./google-sheets.js";
import { safeErrorMessage } from "./app-error.js";

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

function editDraft(workout) {
  return {
    mode: "edit",
    sessionId: workout.id,
    trainingDate: workout.date,
    title: workout.workout,
    durationMinutes: workout.duration ? String(workout.duration) : "",
    exercises: workout.exercises.map((exercise) => ({
      name: exercise.name,
      category: exercise.category,
      sets: exercise.sets.map((set) => ({
        weightKg: String(set.weight),
        reps: String(set.reps),
        rpe: set.rpe === null ? "" : String(set.rpe),
        type: set.type,
        isWarmup: set.isWarmup,
        notes: set.notes,
      })),
    })),
  };
}

function renderSession(workout, editable) {
  const article = document.createElement("article");
  article.className = "card record-session";
  const details = document.createElement("details");
  details.className = "record-session-details";
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
  article.append(details);

  if (editable) {
    const actions = document.createElement("div");
    actions.className = "record-session-actions";
    const edit = appendText(actions, "button", "button compact-button", "編輯");
    edit.type = "button";
    edit.addEventListener("click", () => {
      appState.set("recordDraft", editDraft(workout));
      window.location.hash = "/record/new";
    });
    const remove = appendText(actions, "button", "button compact-button danger-button", "刪除");
    remove.type = "button";
    remove.addEventListener("click", async () => {
      const setCount = workout.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
      if (!window.confirm(`確定刪除「${workout.workout}」？這會同時刪除 ${setCount} 組訓練資料，且無法復原。`)) return;
      remove.disabled = true;
      edit.disabled = true;
      setStatus("正在刪除訓練紀錄…", "loading");
      try {
        const selected = getSelectedSpreadsheet();
        const accessToken = await googleAuth.getAccessToken();
        await deleteWorkoutRecord(selected.id, accessToken, workout.id);
        window.dispatchEvent(new CustomEvent("fitness:data-changed", { detail: { source: "records" } }));
      } catch (error) {
        console.error("Unable to delete workout record.", error);
        setStatus(describeError(error), "error");
        remove.disabled = false;
        edit.disabled = false;
      }
    });
    article.append(actions);
  }
  return article;
}

function describeError(error) {
  return safeErrorMessage(error, "無法讀取訓練紀錄。");
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
  const editable = Boolean(
    getSelectedSpreadsheet()?.id
    && window.FitnessConfig?.googleSheets?.oauthClientId?.trim(),
  );
  workouts.forEach((workout) => output.append(renderSession(workout, editable)));
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
