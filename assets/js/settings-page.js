import { AppError, safeErrorMessage } from "./app-error.js";
import { appState } from "./app-state.js";
import { googleAuth } from "./auth-service.js";
import { readRanges, repairSpreadsheet, saveExerciseRecord, setExerciseActive, upsertSettings, validateSpreadsheet } from "./google-sheets.js";
import { createSettingRecords, parseSettings, validateSettings } from "./settings.js";
import { createExerciseRecord, parseExercises, sortExerciseSuggestions, validateExerciseInput } from "./exercises.js";

const form = document.querySelector("[data-settings-form]");
const connection = document.querySelector("[data-settings-connection]");
const loadButton = document.querySelector("[data-load-settings]");
const repairButton = document.querySelector("[data-repair-schema]");
const disconnectButton = document.querySelector("[data-disconnect-sheet]");
const schemaStatus = document.querySelector("[data-schema-status]");
const settingsStatus = document.querySelector("[data-settings-status]");
const validation = document.querySelector("[data-settings-validation]");
const exerciseManager = document.querySelector("[data-exercise-manager]");
const exerciseForm = document.querySelector("[data-exercise-form]");
const exerciseList = document.querySelector("[data-exercise-list]");
const exerciseStatus = document.querySelector("[data-exercise-status]");
const exerciseValidation = document.querySelector("[data-exercise-validation]");
const exerciseSearch = document.querySelector("[data-exercise-search]");
let exercises = [];

function setBusy(busy) {
  document.querySelectorAll("[data-route-page='/settings'] button").forEach((button) => { button.disabled = busy; });
}

function showErrors(errors) {
  validation.replaceChildren();
  validation.hidden = errors.length === 0;
  if (errors.length === 0) return;
  const list = document.createElement("ul");
  errors.forEach((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    list.append(item);
  });
  validation.append(list);
}

function populate(settings) {
  form.elements.weight_unit.value = settings.weight_unit;
  form.elements.locale.value = settings.locale;
  form.elements.theme.value = settings.theme;
  form.elements.default_rpe_enabled.checked = settings.default_rpe_enabled === "true";
  document.documentElement.dataset.theme = settings.theme;
}

function readForm() {
  return {
    weight_unit: form.elements.weight_unit.value,
    locale: form.elements.locale.value,
    theme: form.elements.theme.value,
    default_rpe_enabled: String(form.elements.default_rpe_enabled.checked),
  };
}

function categoryLabel(category) {
  return { squat: "深蹲", bench: "臥推", deadlift: "硬舉", accessory: "輔助動作" }[category] ?? category;
}

function renderExercises() {
  exerciseList.replaceChildren();
  const query = exerciseSearch.value.trim().toLocaleLowerCase("zh-TW");
  const visible = sortExerciseSuggestions(exercises, { includeInactive: true }).filter((exercise) => (
    !query || exercise.name.toLocaleLowerCase("zh-TW").includes(query) || categoryLabel(exercise.category).includes(query)
  ));
  visible.forEach((exercise) => {
    const article = document.createElement("article");
    article.className = "card exercise-manager-item";
    const content = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = exercise.name;
    const meta = document.createElement("p");
    meta.textContent = `${categoryLabel(exercise.category)} · ${exercise.isDefault ? "系統預設" : "自訂動作"} · ${exercise.isActive ? "啟用中" : "已停用"}${exercise.lastUsedAt ? ` · 最近使用 ${exercise.lastUsedAt.slice(0, 10)}` : ""}`;
    content.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "share-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "button compact-button";
    edit.textContent = "編輯";
    edit.dataset.editExercise = exercise.id;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = `button compact-button${exercise.isActive ? " danger-button" : ""}`;
    toggle.textContent = exercise.isActive ? "停用" : "重新啟用";
    toggle.dataset.toggleExercise = exercise.id;
    actions.append(edit, toggle);
    article.append(content, actions);
    exerciseList.append(article);
  });
  if (visible.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = query ? "找不到符合條件的動作。" : "目前沒有動作資料。";
    exerciseList.append(empty);
  }
}

function openExerciseForm(exercise = null) {
  exerciseForm.hidden = false;
  exerciseForm.elements.exercise_id.value = exercise?.id ?? "";
  exerciseForm.elements.exercise_name.value = exercise?.name ?? "";
  exerciseForm.elements.category.value = exercise?.category ?? "accessory";
  exerciseForm.querySelector("[data-exercise-form-title]").textContent = exercise ? "編輯動作" : "新增動作";
  exerciseValidation.hidden = true;
  exerciseForm.elements.exercise_name.focus();
}

function showExerciseErrors(errors) {
  exerciseValidation.replaceChildren();
  exerciseValidation.hidden = errors.length === 0;
  if (errors.length === 0) return;
  const list = document.createElement("ul");
  errors.forEach((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    list.append(item);
  });
  exerciseValidation.append(list);
}

async function loadSettings(spreadsheet, token = googleAuth.getValidAccessToken()) {
  if (!token) throw new AppError("authorization_expired");
  await validateSpreadsheet(spreadsheet.id, token);
  const [settingsRows, exerciseRows] = await readRanges(spreadsheet.id, token, ["Settings", "Exercises"]);
  populate(parseSettings(settingsRows));
  exercises = parseExercises(exerciseRows);
  appState.set("exercises", exercises);
  renderExercises();
  form.hidden = false;
  exerciseManager.hidden = false;
  settingsStatus.textContent = "偏好設定已載入。";
}

async function initialize() {
  let spreadsheet = appState.get("selectedSpreadsheet");
  const clientId = window.FitnessConfig?.googleSheets?.oauthClientId?.trim();
  if (clientId) {
    try {
      await googleAuth.configure(clientId).initialize();
    } catch (error) {
      schemaStatus.textContent = safeErrorMessage(error, "無法準備 Google 授權。");
    }
  }

  const renderConnection = () => {
    connection.textContent = spreadsheet?.id ? `目前連線：${spreadsheet.name}` : "尚未選擇 Google Sheet。";
    loadButton.disabled = !spreadsheet?.id || !clientId;
    repairButton.disabled = !spreadsheet?.id || !clientId;
    disconnectButton.disabled = !spreadsheet?.id;
    if (!spreadsheet?.id) {
      form.hidden = true;
      exerciseManager.hidden = true;
    }
  };
  renderConnection();

  window.addEventListener("fitness:state-change", (event) => {
    if (event.detail.key !== "selectedSpreadsheet") return;
    spreadsheet = event.detail.value;
    renderConnection();
  });
  const loadCurrentSettings = async () => {
    if (!spreadsheet?.id) return;
    setBusy(true);
    try {
      await loadSettings(spreadsheet);
    } catch (error) {
      settingsStatus.textContent = safeErrorMessage(error, "無法載入偏好設定。");
      settingsStatus.dataset.state = "error";
    } finally {
      setBusy(false);
      renderConnection();
    }
  };
  window.addEventListener("fitness:route-change", async (event) => {
    if (event.detail.route !== "/settings") return;
    await loadCurrentSettings();
  });
  if (window.location.hash === "#/settings") await loadCurrentSettings();

  loadButton.addEventListener("click", async () => {
    if (!spreadsheet?.id) return;
    setBusy(true);
    settingsStatus.textContent = "正在連線並載入偏好設定…";
    try {
      const token = googleAuth.getValidAccessToken() ?? await googleAuth.getAccessToken();
      await loadSettings(spreadsheet, token);
      settingsStatus.dataset.state = "success";
    } catch (error) {
      settingsStatus.textContent = safeErrorMessage(error, "無法載入偏好設定。");
      settingsStatus.dataset.state = "error";
    } finally {
      setBusy(false);
      renderConnection();
    }
  });

  repairButton.addEventListener("click", async () => {
    if (!spreadsheet?.id || !window.confirm("修復只會建立缺少的工作表、欄位與初始資料，不會刪除或重新排序現有資料。確定繼續？")) return;
    setBusy(true);
    schemaStatus.textContent = "正在檢查並修復資料結構…";
    try {
      const token = googleAuth.getValidAccessToken() ?? await googleAuth.getAccessToken();
      await repairSpreadsheet(spreadsheet.id, token);
      schemaStatus.textContent = "資料結構已通過檢查，缺少的結構已補齊。";
      schemaStatus.dataset.state = "success";
      await loadSettings(spreadsheet, token);
    } catch (error) {
      schemaStatus.textContent = safeErrorMessage(error, "無法修復資料結構。");
      schemaStatus.dataset.state = "error";
    } finally {
      setBusy(false);
      renderConnection();
    }
  });

  disconnectButton.addEventListener("click", () => {
    if (!window.confirm("只會移除此瀏覽器儲存的試算表連線，不會刪除 Google Sheet。確定繼續？")) return;
    googleAuth.clear();
    appState.clearSelectedSpreadsheet();
    schemaStatus.textContent = "已移除此裝置上的連線，Google Sheet 資料未受影響。";
    schemaStatus.dataset.state = "success";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const settings = readForm();
    const errors = validateSettings(settings);
    showErrors(errors);
    if (errors.length > 0) return;
    setBusy(true);
    settingsStatus.textContent = "正在儲存偏好設定…";
    try {
      const token = googleAuth.getValidAccessToken() ?? await googleAuth.getAccessToken();
      await upsertSettings(spreadsheet.id, token, createSettingRecords(settings));
      document.documentElement.dataset.theme = settings.theme;
      settingsStatus.textContent = "偏好設定已儲存。";
      settingsStatus.dataset.state = "success";
    } catch (error) {
      settingsStatus.textContent = safeErrorMessage(error, "無法儲存偏好設定。");
      settingsStatus.dataset.state = "error";
    } finally {
      setBusy(false);
      renderConnection();
    }
  });

  document.querySelector("[data-new-exercise]").addEventListener("click", () => openExerciseForm());
  exerciseSearch.addEventListener("input", renderExercises);
  document.querySelector("[data-cancel-exercise]").addEventListener("click", () => { exerciseForm.hidden = true; });
  exerciseList.addEventListener("click", async (event) => {
    const editId = event.target.closest("[data-edit-exercise]")?.dataset.editExercise;
    if (editId) return openExerciseForm(exercises.find((exercise) => exercise.id === editId));
    const toggleId = event.target.closest("[data-toggle-exercise]")?.dataset.toggleExercise;
    if (!toggleId) return;
    const exercise = exercises.find((item) => item.id === toggleId);
    if (!exercise || !window.confirm(`${exercise.isActive ? "停用" : "重新啟用"}「${exercise.name}」？歷史訓練不會被修改。`)) return;
    setBusy(true);
    try {
      const token = googleAuth.getValidAccessToken() ?? await googleAuth.getAccessToken();
      await setExerciseActive(spreadsheet.id, token, exercise.id, !exercise.isActive);
      exercise.isActive = !exercise.isActive;
      appState.set("exercises", exercises);
      renderExercises();
      exerciseStatus.textContent = `「${exercise.name}」已${exercise.isActive ? "啟用" : "停用"}。`;
    } catch (error) {
      exerciseStatus.textContent = safeErrorMessage(error, "無法更新動作狀態。");
      exerciseStatus.dataset.state = "error";
    } finally {
      setBusy(false);
      renderConnection();
    }
  });

  exerciseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = exerciseForm.elements.exercise_id.value;
    const input = { name: exerciseForm.elements.exercise_name.value, category: exerciseForm.elements.category.value };
    const errors = validateExerciseInput(input, exercises, id);
    showExerciseErrors(errors);
    if (errors.length > 0) return;
    const existing = exercises.find((exercise) => exercise.id === id);
    const record = createExerciseRecord(existing ? { ...existing, ...input } : input);
    setBusy(true);
    try {
      const token = googleAuth.getValidAccessToken() ?? await googleAuth.getAccessToken();
      await saveExerciseRecord(spreadsheet.id, token, record);
      const [rows] = await readRanges(spreadsheet.id, token, ["Exercises"]);
      exercises = parseExercises(rows);
      appState.set("exercises", exercises);
      renderExercises();
      exerciseForm.hidden = true;
      exerciseStatus.textContent = existing ? "動作已更新；歷史訓練保留原名稱。" : "動作已新增。";
    } catch (error) {
      exerciseStatus.textContent = safeErrorMessage(error, "無法儲存動作。");
      exerciseStatus.dataset.state = "error";
    } finally {
      setBusy(false);
      renderConnection();
    }
  });
}

initialize();
