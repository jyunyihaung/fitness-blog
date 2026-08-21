import { appState } from "./app-state.js";
import { googleAuth } from "./auth-service.js";
import { getWorkoutData } from "./data.js";
import { parseGoals } from "./goals.js";
import { appendWorkoutRecord, readRanges } from "./google-sheets.js";
import { resolveReferenceOneRepMax } from "./one-rep-max.js";
import { generateQuickAddDraft, QUICK_ADD_LIFTS, TRAINING_MODES } from "./quick-add.js";
import { createWorkoutRecords, validateWorkoutInput } from "./record-validation.js";
import { createWorkoutEditor } from "./workout-editor.js";

const liftOutput = document.querySelector("[data-lift-choices]");
const modeOutput = document.querySelector("[data-mode-choices]");
const generateButton = document.querySelector("[data-generate-workout]");
const manualPanel = document.querySelector("[data-manual-one-rm]");
const manualInput = document.querySelector("[data-reference-one-rm]");
const errorOutput = document.querySelector("[data-quick-error]");
const preview = document.querySelector("[data-workout-preview]");
const connectionOutput = document.querySelector("[data-quick-connection]");
const quickExercises = document.querySelector("[data-quick-exercises]");
const saveButton = document.querySelector("[data-save-quick-workout]");
const saveError = document.querySelector("[data-quick-save-error]");
const saveStatus = document.querySelector("[data-quick-save-status]");
const durationInput = document.querySelector("[data-quick-duration]");
const editor = createWorkoutEditor(quickExercises, { completionEnabled: true });

let selectedLift = "";
let selectedMode = "";
let generatedDraft = null;

const SOURCE_LABELS = {
  "goal-current": "Goals 目前重量",
  "best-single": "歷史最佳單次",
  estimated: "歷史估算 1RM",
  manual: "手動參考 1RM",
};

function localDateString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function createChoiceButton({ id, title, subtitle, group }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "choice-card";
  button.dataset.choiceId = id;
  button.dataset.choiceGroup = group;
  button.setAttribute("aria-pressed", "false");
  const strong = document.createElement("strong");
  strong.textContent = title;
  const description = document.createElement("span");
  description.textContent = subtitle;
  button.append(strong, description);
  return button;
}

function renderChoices() {
  Object.values(QUICK_ADD_LIFTS).forEach((lift) => {
    liftOutput.append(createChoiceButton({ id: lift.id, title: lift.name, subtitle: lift.label, group: "lift" }));
  });
  Object.values(TRAINING_MODES).forEach((mode) => {
    const preset = mode.preset;
    modeOutput.append(createChoiceButton({
      id: mode.id,
      title: mode.englishLabel,
      subtitle: `${mode.label} · ${preset.intensity * 100}% · ${preset.reps} reps · ${preset.sets} sets`,
      group: "mode",
    }));
  });
}

function selectChoice(button) {
  const group = button.dataset.choiceGroup;
  document.querySelectorAll(`[data-choice-group="${group}"]`).forEach((choice) => {
    choice.setAttribute("aria-pressed", String(choice === button));
  });
  if (group === "lift") selectedLift = button.dataset.choiceId;
  else selectedMode = button.dataset.choiceId;
  preview.hidden = true;
}

function showError(message) {
  errorOutput.textContent = message;
  errorOutput.hidden = !message;
}

function setBusy(busy) {
  generateButton.disabled = busy;
  generateButton.textContent = busy ? "正在讀取訓練資料…" : "產生訓練建議";
}

async function loadCurrentData(spreadsheet) {
  const accessToken = await googleAuth.getAccessToken();
  const [workouts, [goalRows]] = await Promise.all([
    getWorkoutData({ spreadsheetId: spreadsheet.id, accessToken }),
    readRanges(spreadsheet.id, accessToken, ["Goals"]),
  ]);
  const goals = parseGoals(goalRows);
  appState.set("workouts", workouts);
  appState.set("goals", goals);
  return { workouts, goals };
}

function renderPreview(draft, reference) {
  const lift = QUICK_ADD_LIFTS[draft.quickAdd.liftId];
  const mode = TRAINING_MODES[draft.quickAdd.modeId];
  document.querySelector("[data-preview-lift]").textContent = `${lift.name} / ${lift.label}`;
  document.querySelector("[data-preview-reference]").textContent = `${reference.value} kg`;
  document.querySelector("[data-preview-source]").textContent = SOURCE_LABELS[reference.source];
  document.querySelector("[data-preview-mode]").textContent = `${mode.englishLabel} / ${mode.label}`;
  document.querySelector("[data-preview-preset]").textContent = `${mode.preset.intensity * 100}% 1RM`;
  document.querySelector("[data-preview-workout]").textContent = `${draft.quickAdd.weight} kg × ${mode.preset.reps} reps × ${mode.preset.sets} sets`;
  editor.load(draft.exercises);
  durationInput.value = draft.durationMinutes || "5";
  saveError.hidden = true;
  saveStatus.textContent = "請勾選已完成的組數，只有完成的組數會被儲存。";
  preview.hidden = false;
  preview.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showSaveErrors(errors) {
  saveError.replaceChildren();
  if (!errors.length) {
    saveError.hidden = true;
    return;
  }
  const list = document.createElement("ul");
  errors.forEach((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    list.append(item);
  });
  saveError.append(list);
  saveError.hidden = false;
}

async function saveWorkout() {
  const spreadsheet = appState.get("selectedSpreadsheet");
  if (!spreadsheet?.id) return showSaveErrors(["尚未選擇 Google Sheet，請先回到 Dashboard 完成連線。"]);
  if (!generatedDraft) return showSaveErrors(["請先產生訓練建議。"]);
  const completedExercises = editor.read({ completedOnly: true });
  if (!completedExercises.length) return showSaveErrors(["請至少勾選一組已完成的訓練內容。"]);
  const input = {
    ...generatedDraft,
    durationMinutes: durationInput.value,
    exercises: completedExercises,
  };
  const errors = validateWorkoutInput(input);
  showSaveErrors(errors);
  if (errors.length) return;

  saveButton.disabled = true;
  saveStatus.textContent = "正在要求 Google 授權…";
  try {
    const accessToken = await googleAuth.getAccessToken();
    saveStatus.textContent = "正在寫入 Google Sheet…";
    await appendWorkoutRecord(spreadsheet.id, accessToken, createWorkoutRecords(input));
    window.dispatchEvent(new CustomEvent("fitness:data-changed", { detail: { source: "quick-add" } }));
    saveStatus.textContent = "訓練紀錄已儲存，正在返回 Dashboard。";
    window.location.hash = "/dashboard";
  } catch (error) {
    console.error("Unable to save Quick Add workout.", error);
    const message = error?.name === "AbortError"
      ? "授權已取消，訓練內容仍保留。"
      : error?.status === 403
        ? "目前 Google 帳號沒有寫入這份試算表的權限。"
        : error?.message || "無法儲存訓練紀錄，請稍後重試。";
    showSaveErrors([message]);
    saveStatus.textContent = "";
  } finally {
    saveButton.disabled = false;
  }
}

async function generateWorkout() {
  showError("");
  if (!selectedLift) return showError("請先選擇 Squat、Bench Press 或 Deadlift。");
  if (!selectedMode) return showError("請選擇一個訓練模式。");
  const spreadsheet = appState.get("selectedSpreadsheet");
  if (!spreadsheet?.id) return showError("尚未選擇 Google Sheet，請先回到 Dashboard 完成連線。");

  setBusy(true);
  try {
    const { workouts, goals } = await loadCurrentData(spreadsheet);
    const reference = resolveReferenceOneRepMax({
      lift: selectedLift,
      goals,
      workouts,
      manualOneRepMax: manualInput.value,
    });
    if (!reference) {
      manualPanel.hidden = false;
      manualInput.focus();
      showError("找不到可用的 1RM，請輸入參考 1RM 後再次產生。");
      return;
    }
    manualPanel.hidden = reference.source !== "manual";
    generatedDraft = generateQuickAddDraft({
      liftId: selectedLift,
      modeId: selectedMode,
      referenceOneRepMax: reference.value,
      trainingDate: localDateString(),
    });
    renderPreview(generatedDraft, reference);
  } catch (error) {
    console.error("Unable to generate Quick Add workout.", error);
    showError(error?.status === 403
      ? "目前 Google 帳號沒有讀取這份試算表的權限。"
      : error?.message || "無法產生訓練建議，請稍後重試。");
  } finally {
    setBusy(false);
  }
}

function updateConnection() {
  const spreadsheet = appState.get("selectedSpreadsheet");
  connectionOutput.hidden = Boolean(spreadsheet?.id);
  connectionOutput.textContent = spreadsheet?.id
    ? ""
    : "尚未選擇 Google Sheet。你仍可查看選項，但產生建議前必須先至 Dashboard 連線。";
}

renderChoices();
document.querySelector("[data-route-page='/quick-add']").addEventListener("click", (event) => {
  const choice = event.target.closest("[data-choice-id]");
  if (choice) selectChoice(choice);
});
generateButton.addEventListener("click", generateWorkout);
document.querySelector("[data-quick-add-exercise]").addEventListener("click", () => {
  const exercise = editor.addExercise();
  exercise.querySelector("[data-exercise-name]").focus();
});
saveButton.addEventListener("click", saveWorkout);
window.addEventListener("fitness:state-change", (event) => {
  if (event.detail.key === "selectedSpreadsheet") updateConnection();
});
updateConnection();
