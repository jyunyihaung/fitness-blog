import { AppError, safeErrorMessage } from "./app-error.js";
import { appState } from "./app-state.js";
import { googleAuth } from "./auth-service.js";
import { readRanges, repairSpreadsheet, upsertSettings, validateSpreadsheet } from "./google-sheets.js";
import { createSettingRecords, parseSettings, validateSettings } from "./settings.js";

const form = document.querySelector("[data-settings-form]");
const connection = document.querySelector("[data-settings-connection]");
const loadButton = document.querySelector("[data-load-settings]");
const repairButton = document.querySelector("[data-repair-schema]");
const disconnectButton = document.querySelector("[data-disconnect-sheet]");
const schemaStatus = document.querySelector("[data-schema-status]");
const settingsStatus = document.querySelector("[data-settings-status]");
const validation = document.querySelector("[data-settings-validation]");

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

async function loadSettings(spreadsheet, token = googleAuth.getValidAccessToken()) {
  if (!token) throw new AppError("authorization_expired");
  await validateSpreadsheet(spreadsheet.id, token);
  const [rows] = await readRanges(spreadsheet.id, token, ["Settings"]);
  populate(parseSettings(rows));
  form.hidden = false;
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
    if (!spreadsheet?.id) form.hidden = true;
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
}

initialize();
