import { appendWorkoutRecord } from "./google-sheets.js";
import { googleAuth } from "./auth-service.js";
import { appState } from "./app-state.js";
import { createWorkoutRecords, validateWorkoutInput } from "./record-validation.js";

const form = document.querySelector("[data-record-form]");
const exercisesOutput = document.querySelector("[data-exercises]");
const exerciseTemplate = document.querySelector("[data-exercise-template]");
const setTemplate = document.querySelector("[data-set-template]");
const validationSummary = document.querySelector("[data-validation-summary]");
const saveStatus = document.querySelector("[data-save-status]");
const saveButton = document.querySelector("[data-save-record]");

function localDateString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function renumberEditors() {
  exercisesOutput.querySelectorAll("[data-exercise]").forEach((exercise, exerciseIndex) => {
    exercise.querySelector("[data-exercise-number]").textContent = String(exerciseIndex + 1);
    exercise.querySelectorAll("[data-set]").forEach((set, setIndex) => {
      set.querySelector("[data-set-number]").textContent = String(setIndex + 1);
    });
  });
}

function writeSetValues(set, values) {
  set.querySelector("[data-set-weight]").value = values.weightKg ?? "0";
  set.querySelector("[data-set-reps]").value = values.reps ?? "1";
  set.querySelector("[data-set-rpe]").value = values.rpe ?? "";
  set.querySelector("[data-set-type]").value = values.type ?? "working";
  set.querySelector("[data-set-warmup]").checked = Boolean(values.isWarmup);
  set.querySelector("[data-set-notes]").value = values.notes ?? "";
}

function readSetValues(set) {
  return {
    weightKg: set.querySelector("[data-set-weight]").value,
    reps: set.querySelector("[data-set-reps]").value,
    rpe: set.querySelector("[data-set-rpe]").value,
    type: set.querySelector("[data-set-type]").value,
    isWarmup: set.querySelector("[data-set-warmup]").checked,
    notes: set.querySelector("[data-set-notes]").value,
  };
}

function addSet(exercise, values = null) {
  const previousSet = exercise.querySelector("[data-set]:last-child");
  const fragment = setTemplate.content.cloneNode(true);
  const nextSet = fragment.querySelector("[data-set]");
  if (values) writeSetValues(nextSet, values);
  else if (previousSet) writeSetValues(nextSet, readSetValues(previousSet));
  exercise.querySelector("[data-sets]").append(fragment);
  renumberEditors();
}

function addExercise(values = null) {
  const fragment = exerciseTemplate.content.cloneNode(true);
  const exercise = fragment.querySelector("[data-exercise]");
  if (values) {
    exercise.querySelector("[data-exercise-name]").value = values.name ?? "";
    exercise.querySelector("[data-exercise-category]").value = values.category ?? "accessory";
    (values.sets ?? []).forEach((set) => addSet(exercise, set));
  } else addSet(exercise);
  exercisesOutput.append(fragment);
  renumberEditors();
  return exercise;
}

function populateDraft(draft) {
  if (!draft) return;
  form.elements.training_date.value = draft.trainingDate || localDateString();
  form.elements.title.value = draft.title ?? "";
  form.elements.duration_minutes.value = draft.durationMinutes ?? "5";
  exercisesOutput.replaceChildren();
  (draft.exercises ?? []).forEach((exercise) => addExercise(exercise));
  if (!exercisesOutput.firstElementChild) addExercise();
  showValidation([]);
  setStatus("快速新增建議已載入，你可以修改後儲存。", "success");
}

function readInput() {
  const data = new FormData(form);
  return {
    trainingDate: String(data.get("training_date") ?? ""),
    title: String(data.get("title") ?? ""),
    durationMinutes: String(data.get("duration_minutes") ?? ""),
    exercises: Array.from(exercisesOutput.querySelectorAll("[data-exercise]")).map((exercise) => ({
      name: exercise.querySelector("[data-exercise-name]").value,
      category: exercise.querySelector("[data-exercise-category]").value,
      sets: Array.from(exercise.querySelectorAll("[data-set]")).map(readSetValues),
    })),
  };
}

function showValidation(errors) {
  validationSummary.replaceChildren();
  if (errors.length === 0) {
    validationSummary.hidden = true;
    return;
  }
  const heading = document.createElement("strong");
  heading.textContent = "請修正以下內容：";
  const list = document.createElement("ul");
  errors.forEach((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    list.append(item);
  });
  validationSummary.append(heading, list);
  validationSummary.hidden = false;
  validationSummary.scrollIntoView({ behavior: "smooth", block: "center" });
}

function setSaving(saving) {
  saveButton.disabled = saving;
  document.querySelectorAll("[data-record-form] button").forEach((button) => {
    button.disabled = saving;
  });
}

function setStatus(message, state = "idle") {
  saveStatus.textContent = message;
  saveStatus.dataset.state = state;
}

function describeError(error) {
  if (error?.name === "AbortError") return "授權已取消，表單內容仍保留，你可以再次儲存。";
  if (error?.status === 401) return "Google 授權已過期，請再次儲存並重新授權。";
  if (error?.status === 403) return "目前 Google 帳號沒有寫入這份試算表的權限。";
  return error?.message || "無法儲存訓練紀錄，請稍後重試。";
}

function handleEditorClick(event) {
  const addSetButton = event.target.closest("[data-add-set]");
  if (addSetButton) {
    addSet(addSetButton.closest("[data-exercise]"));
    return;
  }
  const removeSetButton = event.target.closest("[data-remove-set]");
  if (removeSetButton) {
    removeSetButton.closest("[data-set]").remove();
    renumberEditors();
    return;
  }
  const removeExerciseButton = event.target.closest("[data-remove-exercise]");
  if (removeExerciseButton) {
    removeExerciseButton.closest("[data-exercise]").remove();
    renumberEditors();
  }
}

async function initialize() {
  form.elements.training_date.value = localDateString();
  document.querySelector("[data-add-exercise]").addEventListener("click", () => {
    const exercise = addExercise();
    exercise.querySelector("[data-exercise-name]").focus();
  });
  exercisesOutput.addEventListener("click", handleEditorClick);
  addExercise();
  populateDraft(appState.get("recordDraft"));

  let selectedSpreadsheet = appState.get("selectedSpreadsheet");
  const connectionMessage = document.querySelector("[data-connection-message]");
  const updateConnection = () => {
    const connected = Boolean(selectedSpreadsheet?.id);
    connectionMessage.textContent = connected
      ? `將寫入：${selectedSpreadsheet.name}`
      : "尚未連接 Google Sheet。請先返回 Dashboard 選擇或建立試算表。";
    connectionMessage.hidden = connected;
    saveButton.disabled = !connected;
  };
  updateConnection();
  window.addEventListener("fitness:state-change", (event) => {
    if (event.detail.key === "selectedSpreadsheet") {
      selectedSpreadsheet = event.detail.value;
      updateConnection();
    }
    if (event.detail.key === "recordDraft" && event.detail.value) populateDraft(event.detail.value);
  });

  const clientId = window.FitnessConfig?.googleSheets?.oauthClientId?.trim();
  if (!clientId) {
    connectionMessage.textContent = "網站尚未完成 Google OAuth 設定，暫時無法寫入資料。";
    connectionMessage.hidden = false;
    saveButton.disabled = true;
    return;
  }

  const oauth = googleAuth.configure(clientId);
  setSaving(true);
  setStatus("正在準備 Google 授權…");
  try {
    await oauth.initialize();
    setStatus(selectedSpreadsheet?.name ? `將寫入：${selectedSpreadsheet.name}` : "Google 授權已就緒。請先選擇試算表。");
  } catch (error) {
    setStatus(describeError(error), "error");
    setSaving(false);
    saveButton.disabled = true;
    return;
  }
  setSaving(false);
  updateConnection();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = readInput();
    const errors = validateWorkoutInput(input);
    showValidation(errors);
    if (errors.length > 0) return;

    setSaving(true);
    setStatus("正在要求 Google 授權…");
    try {
      const accessToken = await oauth.getAccessToken();
      setStatus("正在寫入 Google Sheet…");
      await appendWorkoutRecord(
        selectedSpreadsheet.id,
        accessToken,
        createWorkoutRecords(input),
      );
      appState.set("recordDraft", null);
      window.dispatchEvent(new CustomEvent("fitness:data-changed", { detail: { source: "record" } }));
      setStatus("訓練紀錄已儲存，正在返回 Dashboard。", "success");
      window.location.hash = "/dashboard";
    } catch (error) {
      console.error("Unable to save workout record.", error);
      setStatus(describeError(error), error?.name === "AbortError" ? "idle" : "error");
    } finally {
      setSaving(false);
    }
  });
}

initialize();
