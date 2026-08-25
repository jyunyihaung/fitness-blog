import { appendWorkoutRecord, replaceWorkoutRecord, syncUsedExercises } from "./google-sheets.js";
import { googleAuth } from "./auth-service.js";
import { appState } from "./app-state.js";
import { createWorkoutRecords, validateWorkoutInput } from "./record-validation.js";
import { createWorkoutEditor } from "./workout-editor.js";
import { safeErrorMessage } from "./app-error.js";
import { createWorkoutTemplate, decodeWorkoutShareCode, encodeWorkoutShareCode, getWorkoutShareCodeDiagnostics } from "./workout-share-code.js?v=3";

const form = document.querySelector("[data-record-form]");
const exercisesOutput = document.querySelector("[data-exercises]");
const validationSummary = document.querySelector("[data-validation-summary]");
const saveStatus = document.querySelector("[data-save-status]");
const saveButton = document.querySelector("[data-save-record]");
const pageTitle = document.querySelector("#record-title");
const pageLede = document.querySelector("[data-record-lede]");
const cancelLink = document.querySelector("[data-cancel-record]");
const routePage = form.closest("[data-route-page]");
let editingSessionId = null;

function setEditMode(sessionId = null) {
  editingSessionId = sessionId;
  const editing = Boolean(editingSessionId);
  pageTitle.textContent = editing ? "編輯訓練紀錄" : "新增訓練紀錄";
  pageLede.textContent = editing
    ? "修改本次訓練、動作與組數，儲存後會更新已連接的 Google Sheet。"
    : "記錄本次訓練、動作與每一組內容，資料會直接寫入已連接的 Google Sheet。";
  saveButton.textContent = editing ? "儲存修改" : "儲存訓練紀錄";
  cancelLink.href = editing ? "#/records" : "#/dashboard";
  if (routePage) routePage.dataset.routeTitle = editing ? "編輯訓練紀錄" : "新增訓練紀錄";
}

function localDateString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

const editor = createWorkoutEditor(exercisesOutput);

function populateDraft(draft) {
  if (!draft) return;
  setEditMode(draft.mode === "edit" ? draft.sessionId : null);
  form.elements.training_date.value = draft.trainingDate || localDateString();
  form.elements.title.value = draft.title ?? "";
  form.elements.duration_minutes.value = draft.durationMinutes ?? "5";
  form.elements.notes.value = draft.notes ?? "";
  editor.load(draft.exercises ?? []);
  showValidation([]);
  const loadedMessage = draft.mode === "import"
    ? "教練課表已匯入。你可以修改內容，確認後再手動儲存。"
    : "快速新增建議已載入，你可以修改後儲存。";
  setStatus(editingSessionId ? "已載入訓練紀錄，你可以修改後儲存。" : loadedMessage, "success");
}

function readInput() {
  const data = new FormData(form);
  return {
    trainingDate: String(data.get("training_date") ?? ""),
    title: String(data.get("title") ?? ""),
    durationMinutes: String(data.get("duration_minutes") ?? ""),
    notes: String(data.get("notes") ?? ""),
    exercises: editor.read(),
  };
}

function setDialogError(output, messages) {
  output.replaceChildren();
  output.hidden = messages.length === 0;
  if (messages.length === 0) return;
  const list = document.createElement("ul");
  messages.forEach((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    list.append(item);
  });
  output.append(list);
}

function appendSummaryItem(root, label, value) {
  const wrapper = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = value;
  wrapper.append(term, description);
  root.append(wrapper);
}

function hasMeaningfulDraft(input) {
  if (input.title.trim() || input.notes.trim()) return true;
  return input.exercises.some((exercise) => exercise.name.trim() || exercise.sets.some((set) => (
    set.weightKg !== "0" || set.reps !== "1" || set.rpe !== "" || set.type !== "working" || set.isWarmup || set.notes.trim()
  )));
}

function renderImportPreview(result) {
  const summary = document.querySelector("[data-import-summary]");
  const exercises = document.querySelector("[data-import-exercises]");
  summary.replaceChildren();
  exercises.replaceChildren();
  appendSummaryItem(summary, "建立者", result.summary.displayName || "未提供");
  const exportedAt = new Date(result.summary.exportedAt);
  appendSummaryItem(summary, "匯出時間", Number.isNaN(exportedAt.getTime()) ? "未提供" : exportedAt.toLocaleString("zh-TW"));
  appendSummaryItem(summary, "菜單", result.draft.title);
  appendSummaryItem(summary, "訓練日期", result.draft.trainingDate);
  appendSummaryItem(summary, "預估時間", result.draft.durationMinutes ? `${result.draft.durationMinutes} 分鐘` : "未提供");
  appendSummaryItem(summary, "內容", `${result.summary.exerciseCount} 個動作／${result.summary.setCount} 組`);
  result.draft.exercises.forEach((exercise) => {
    const section = document.createElement("section");
    section.className = "share-preview-exercise";
    const heading = document.createElement("h3");
    heading.textContent = exercise.name;
    const list = document.createElement("ol");
    exercise.sets.forEach((set) => {
      const item = document.createElement("li");
      const details = [`${set.weightKg} kg × ${set.reps}`, set.rpe ? `RPE ${set.rpe}` : "", set.type, set.notes].filter(Boolean);
      item.textContent = details.join("｜");
      list.append(item);
    });
    section.append(heading, list);
    exercises.append(section);
  });
  if (result.draft.notes) {
    const notes = document.createElement("p");
    notes.className = "share-preview-notes";
    notes.textContent = `訓練說明：${result.draft.notes}`;
    exercises.append(notes);
  }
}

function setupShareDialogs() {
  const importDialog = document.querySelector("[data-import-dialog]");
  const exportDialog = document.querySelector("[data-export-dialog]");
  const importEntry = document.querySelector("[data-import-entry]");
  const importPreview = document.querySelector("[data-import-preview]");
  const importCode = document.querySelector("[data-import-code]");
  const importError = document.querySelector("[data-import-error]");
  const importDebug = document.querySelector("[data-import-debug]");
  const exportCode = document.querySelector("[data-export-code]");
  const exportError = document.querySelector("[data-export-error]");
  const copyButton = document.querySelector("[data-copy-export]");
  const copyStatus = document.querySelector("[data-copy-status]");
  let importedDraft = null;

  importDialog.addEventListener("close", () => {
    importCode.value = "";
    importedDraft = null;
  });
  exportDialog.addEventListener("close", () => {
    exportCode.value = "";
    copyStatus.textContent = "";
  });

  document.querySelector("[data-open-import]").addEventListener("click", () => {
    importEntry.hidden = false;
    importPreview.hidden = true;
    setDialogError(importError, []);
    importDebug.hidden = true;
    importDebug.textContent = "";
    importDialog.showModal();
    importCode.focus();
  });
  document.querySelectorAll("[data-close-import]").forEach((button) => button.addEventListener("click", () => importDialog.close()));
  document.querySelector("[data-back-import]").addEventListener("click", () => {
    importEntry.hidden = false;
    importPreview.hidden = true;
    importCode.focus();
  });
  document.querySelector("[data-parse-import]").addEventListener("click", async () => {
    setDialogError(importError, []);
    importDebug.hidden = true;
    importDebug.textContent = "";
    try {
      const result = await decodeWorkoutShareCode(importCode.value);
      importedDraft = result.draft;
      renderImportPreview(result);
      document.querySelector("[data-import-replace-warning]").hidden = !hasMeaningfulDraft(readInput());
      importEntry.hidden = true;
      importPreview.hidden = false;
      document.querySelector("[data-apply-import]").focus();
    } catch (error) {
      setDialogError(importError, String(error?.message || "無法解析課表代碼。").split("\n"));
      importDebug.textContent = `錯誤代碼：${error?.code || "unknown"}\n${getWorkoutShareCodeDiagnostics(importCode.value)}`;
      importDebug.hidden = false;
    }
  });
  document.querySelector("[data-apply-import]").addEventListener("click", () => {
    if (!importedDraft) return;
    appState.set("recordDraft", importedDraft);
    importCode.value = "";
    importDialog.close();
    pageTitle.focus({ preventScroll: true });
  });

  document.querySelector("[data-open-export]").addEventListener("click", () => {
    exportCode.value = "";
    copyButton.disabled = true;
    copyStatus.textContent = "";
    setDialogError(exportError, []);
    exportDialog.showModal();
    document.querySelector("[data-export-name]").focus();
  });
  document.querySelector("[data-close-export]").addEventListener("click", () => exportDialog.close());
  document.querySelector("[data-generate-export]").addEventListener("click", async () => {
    const input = readInput();
    const errors = validateWorkoutInput(input);
    setDialogError(exportError, errors);
    if (errors.length > 0) return;
    try {
      const template = createWorkoutTemplate(input, { displayName: document.querySelector("[data-export-name]").value });
      exportCode.value = await encodeWorkoutShareCode(template);
      copyButton.disabled = false;
      copyStatus.textContent = "課表代碼已產生。";
    } catch (error) {
      setDialogError(exportError, [error?.message || "無法產生課表代碼。"]);
    }
  });
  copyButton.addEventListener("click", async () => {
    if (!exportCode.value) return;
    try {
      await navigator.clipboard.writeText(exportCode.value);
      copyStatus.textContent = "已複製課表代碼。";
    } catch (_) {
      exportCode.focus();
      exportCode.select();
      const copied = typeof document.execCommand === "function" && document.execCommand("copy");
      copyStatus.textContent = copied ? "已複製課表代碼。" : "無法自動複製，已選取代碼，請手動複製。";
    }
  });
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
  return safeErrorMessage(error, "無法儲存訓練紀錄，請稍後重試。");
}

async function initialize() {
  setEditMode();
  form.elements.training_date.value = localDateString();
  document.querySelector("[data-add-exercise]").addEventListener("click", () => {
    const exercise = editor.addExercise();
    exercise.querySelector("[data-exercise-name]").focus();
  });
  editor.load();
  editor.setExerciseOptions(appState.get("exercises"));
  populateDraft(appState.get("recordDraft"));
  setupShareDialogs();
  cancelLink.addEventListener("click", () => {
    if (editingSessionId) appState.set("recordDraft", null);
  });

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
    if (event.detail.key === "exercises") editor.setExerciseOptions(event.detail.value);
  });
  window.addEventListener("fitness:route-change", (event) => {
    if (event.detail.route !== "/record/new" && editingSessionId) {
      setEditMode();
      appState.set("recordDraft", null);
    }
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
      const record = createWorkoutRecords(input);
      if (editingSessionId) await replaceWorkoutRecord(selectedSpreadsheet.id, accessToken, editingSessionId, record);
      else await appendWorkoutRecord(selectedSpreadsheet.id, accessToken, record);
      try {
        appState.set("exercises", await syncUsedExercises(selectedSpreadsheet.id, accessToken, input.exercises));
      } catch (_) {
        window.alert("訓練紀錄已儲存，但動作清單同步失敗。下次連線時仍可繼續使用訓練紀錄。");
      }
      appState.set("recordDraft", null);
      window.dispatchEvent(new CustomEvent("fitness:data-changed", { detail: { source: "record" } }));
      setStatus(editingSessionId ? "訓練紀錄已更新，正在返回紀錄列表。" : "訓練紀錄已儲存，正在返回 Dashboard。", "success");
      window.location.hash = editingSessionId ? "/records" : "/dashboard";
    } catch (error) {
      console.error("Unable to save workout record.", error);
      setStatus(describeError(error), error?.name === "AbortError" ? "idle" : "error");
    } finally {
      setSaving(false);
    }
  });
}

initialize();
