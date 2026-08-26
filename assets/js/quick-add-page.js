import { appState } from "./app-state.js";
import { googleAuth } from "./auth-service.js";
import { getWorkoutData } from "./data.js";
import { parseGoals } from "./goals.js";
import { appendWorkoutRecord, readRanges, syncUsedExercises } from "./google-sheets.js";
import { resolveReferenceOneRepMax } from "./one-rep-max.js";
import { createQuickAddShareInput, generateQuickAddDraft, getTrainingModeWarnings, parseManualOneRepMax, QUICK_ADD_LIFTS, TRAINING_MODES } from "./quick-add.js";
import { createWorkoutRecords, validateWorkoutInput } from "./record-validation.js";
import { createWorkoutEditor } from "./workout-editor.js";
import { reportAppError, safeErrorMessage } from "./app-error.js";
import { createWorkoutTemplate, encodeWorkoutShareCode } from "./workout-share-code.js?v=5";

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
const exportButton = document.querySelector("[data-export-quick-workout]");
const guidance = document.querySelector("[data-training-guidance]");
const warningOutput = document.querySelector("[data-training-warning]");
const referenceModeInputs = Array.from(document.querySelectorAll("[name='quick_reference_mode']"));
const editor = createWorkoutEditor(quickExercises, { completionEnabled: true });
editor.setExerciseOptions(appState.get("exercises"));

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
  else {
    selectedMode = button.dataset.choiceId;
    renderTrainingGuidance(TRAINING_MODES[selectedMode]);
  }
  preview.hidden = true;
}

function rpeLabel(mode) {
  return mode.rpeRange[0] === 0 ? `RPE ≤ ${mode.rpeRange[1]}` : `RPE ${mode.rpeRange.join("–")}`;
}

function renderTrainingGuidance(mode) {
  document.querySelector("[data-guidance-name]").textContent = `${mode.englishLabel} / ${mode.label}`;
  document.querySelector("[data-guidance-prescription]").textContent = `${mode.preset.intensity * 100}% 1RM · ${mode.preset.reps} reps · ${mode.preset.sets} sets`;
  document.querySelector("[data-guidance-goal]").textContent = mode.goal;
  document.querySelector("[data-guidance-rpe]").textContent = rpeLabel(mode);
  document.querySelector("[data-guidance-rest]").textContent = mode.rest;
  document.querySelector("[data-guidance-short-tip]").textContent = mode.shortTip;
  const tips = document.querySelector("[data-guidance-tips]");
  tips.replaceChildren(...mode.tips.map((tip) => {
    const item = document.createElement("li");
    item.textContent = tip;
    return item;
  }));
  guidance.querySelector("details").open = false;
  guidance.hidden = false;
}

function updateTrainingWarning() {
  if (!generatedDraft) return;
  const warnings = getTrainingModeWarnings(
    generatedDraft.quickAdd.modeId,
    editor.read(),
    generatedDraft.quickAdd.referenceOneRepMax,
  );
  warningOutput.textContent = warnings.join(" ");
  warningOutput.hidden = warnings.length === 0;
}

function showError(message) {
  errorOutput.textContent = message;
  errorOutput.hidden = !message;
}

function selectedReferenceMode() {
  return referenceModeInputs.find((input) => input.checked)?.value ?? "current";
}

function setBusy(busy, message = "正在讀取訓練資料…") {
  generateButton.disabled = busy;
  generateButton.textContent = busy ? message : "產生訓練建議";
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
  updateTrainingWarning();
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

function setQuickExportErrors(output, errors) {
  output.replaceChildren();
  output.hidden = errors.length === 0;
  if (errors.length === 0) return;
  const list = document.createElement("ul");
  errors.forEach((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    list.append(item);
  });
  output.append(list);
}

function setupQuickExport() {
  const dialog = document.querySelector("[data-quick-export-dialog]");
  const nameInput = document.querySelector("[data-quick-export-name]");
  const codeOutput = document.querySelector("[data-quick-export-code]");
  const errorOutput = document.querySelector("[data-quick-export-error]");
  const copyButton = document.querySelector("[data-copy-quick-export]");
  const copyStatus = document.querySelector("[data-quick-copy-status]");

  exportButton.addEventListener("click", () => {
    if (!generatedDraft) return showSaveErrors(["請先產生訓練建議。"]);
    codeOutput.value = "";
    copyButton.disabled = true;
    copyStatus.textContent = "";
    setQuickExportErrors(errorOutput, []);
    dialog.showModal();
    nameInput.focus();
  });
  document.querySelector("[data-close-quick-export]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    codeOutput.value = "";
    copyStatus.textContent = "";
  });
  document.querySelector("[data-generate-quick-export]").addEventListener("click", async () => {
    const input = createQuickAddShareInput(generatedDraft, editor.read(), durationInput.value);
    const errors = validateWorkoutInput(input);
    setQuickExportErrors(errorOutput, errors);
    if (errors.length > 0) return;
    try {
      const template = createWorkoutTemplate(input, { displayName: nameInput.value, includeNotes: true });
      codeOutput.value = await encodeWorkoutShareCode(template);
      copyButton.disabled = false;
      copyStatus.textContent = "課表代碼已產生。";
    } catch (error) {
      setQuickExportErrors(errorOutput, [error?.message || "無法產生課表代碼。"]);
    }
  });
  copyButton.addEventListener("click", async () => {
    if (!codeOutput.value) return;
    try {
      await navigator.clipboard.writeText(codeOutput.value);
      copyStatus.textContent = "已複製課表代碼。";
    } catch (_) {
      codeOutput.focus();
      codeOutput.select();
      const copied = typeof document.execCommand === "function" && document.execCommand("copy");
      copyStatus.textContent = copied ? "已複製課表代碼。" : "無法自動複製，已選取代碼，請手動複製。";
    }
  });
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
  exportButton.disabled = true;
  saveStatus.textContent = "正在要求 Google 授權…";
  try {
    const accessToken = await googleAuth.getAccessToken();
    saveStatus.textContent = "正在寫入 Google Sheet…";
    await appendWorkoutRecord(spreadsheet.id, accessToken, createWorkoutRecords(input));
    try {
      appState.set("exercises", await syncUsedExercises(spreadsheet.id, accessToken, input.exercises));
    } catch (_) {
      window.alert("訓練紀錄已儲存，但動作清單同步失敗。下次連線時仍可繼續使用訓練紀錄。");
    }
    window.dispatchEvent(new CustomEvent("fitness:data-changed", { detail: { source: "quick-add" } }));
    saveStatus.textContent = "訓練紀錄已儲存，正在返回 Dashboard。";
    window.location.hash = "/dashboard";
  } catch (error) {
    reportAppError("save-quick-add-workout", error);
    showSaveErrors([safeErrorMessage(error, "無法儲存訓練紀錄，請稍後重試。")]);
    saveStatus.textContent = "";
  } finally {
    saveButton.disabled = false;
    exportButton.disabled = false;
  }
}

async function generateWorkout() {
  showError("");
  if (!selectedLift) return showError("請先選擇 Squat、Bench Press 或 Deadlift。");
  if (!selectedMode) return showError("請選擇一個訓練模式。");
  const referenceMode = selectedReferenceMode();
  const spreadsheet = appState.get("selectedSpreadsheet");
  if (referenceMode === "current" && !spreadsheet?.id) {
    return showError("使用目前最大重量需要先連接 Google Sheet，或改選手動輸入最大重量。");
  }

  setBusy(true, referenceMode === "current" ? "正在讀取目前最大重量…" : "正在產生訓練建議…");
  try {
    let reference;
    if (referenceMode === "manual") {
      const manualValue = parseManualOneRepMax(manualInput.value);
      if (manualValue === null) {
        manualInput.focus();
        showError("請輸入大於 0，並以 0.5 kg 為單位的手動最大重量。");
        return;
      }
      reference = { value: manualValue, source: "manual" };
    } else {
      const { workouts, goals } = await loadCurrentData(spreadsheet);
      reference = resolveReferenceOneRepMax({ lift: selectedLift, goals, workouts });
      if (!reference) {
        showError("找不到可用的目前最大重量，請先設定 Goals、建立訓練紀錄，或改選手動輸入最大重量。");
        return;
      }
    }
    generatedDraft = generateQuickAddDraft({
      liftId: selectedLift,
      modeId: selectedMode,
      referenceOneRepMax: reference.value,
      trainingDate: localDateString(),
    });
    renderPreview(generatedDraft, reference);
  } catch (error) {
    reportAppError("generate-quick-add-workout", error);
    showError(safeErrorMessage(error, "無法產生訓練建議，請稍後重試。"));
  } finally {
    setBusy(false);
  }
}

function updateConnection() {
  const spreadsheet = appState.get("selectedSpreadsheet");
  const manual = selectedReferenceMode() === "manual";
  connectionOutput.hidden = Boolean(spreadsheet?.id) || manual;
  connectionOutput.textContent = spreadsheet?.id
    ? ""
    : "尚未選擇 Google Sheet。目前最大重量需要連線；你也可以改用手動輸入最大重量。";
}

renderChoices();
document.querySelector("[data-route-page='/quick-add']").addEventListener("click", (event) => {
  const choice = event.target.closest("[data-choice-id]");
  if (choice) selectChoice(choice);
});
generateButton.addEventListener("click", generateWorkout);
referenceModeInputs.forEach((input) => input.addEventListener("change", () => {
  const manual = selectedReferenceMode() === "manual";
  manualPanel.dataset.active = String(manual);
  manualInput.disabled = !manual;
  preview.hidden = true;
  showError("");
  updateConnection();
  if (manual) manualInput.focus();
}));
manualInput.addEventListener("input", () => { preview.hidden = true; });
document.querySelector("[data-quick-add-exercise]").addEventListener("click", () => {
  const exercise = editor.addExercise();
  exercise.querySelector("[data-exercise-name]").focus();
});
saveButton.addEventListener("click", saveWorkout);
setupQuickExport();
quickExercises.addEventListener("input", updateTrainingWarning);
quickExercises.addEventListener("change", updateTrainingWarning);
quickExercises.addEventListener("click", () => queueMicrotask(updateTrainingWarning));
window.addEventListener("fitness:state-change", (event) => {
  if (event.detail.key === "selectedSpreadsheet") updateConnection();
  if (event.detail.key === "exercises") editor.setExerciseOptions(event.detail.value);
});
updateConnection();
