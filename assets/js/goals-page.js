import { createGoalRecords, parseGoals, validateGoals } from "./goals.js";
import { googleAuth } from "./auth-service.js";
import { appState } from "./app-state.js";
import { readRanges, upsertGoals, validateSpreadsheet } from "./google-sheets.js";

const connectPanel = document.querySelector("[data-goal-connect]");
const connectionMessage = document.querySelector("[data-goal-connection-message]");
const loadButton = document.querySelector("[data-load-goals]");
const form = document.querySelector("[data-goals-form]");
const statusOutput = document.querySelector("[data-goal-status]");
const validationOutput = document.querySelector("[data-goal-validation]");

function setBusy(busy) {
  loadButton.disabled = busy;
  form.querySelectorAll("button").forEach((button) => {
    button.disabled = busy;
  });
}

function setStatus(message, state = "idle") {
  statusOutput.textContent = message;
  statusOutput.dataset.state = state;
}

function describeError(error) {
  if (error?.name === "AbortError") return "授權已取消，你可以再次連線。";
  if (error?.status === 401) return "Google 授權已過期，請重新連線。";
  if (error?.status === 403) return "目前 Google 帳號沒有存取這份試算表的權限。";
  return error?.message || "無法處理訓練目標，請稍後重試。";
}

function readFormGoals() {
  return Array.from(form.querySelectorAll("[data-goal]")).map((editor) => ({
    id: editor.querySelector("[data-goal-id]").value,
    lift: editor.dataset.lift,
    currentWeightKg: editor.querySelector("[data-current-weight]").value,
    targetWeightKg: editor.querySelector("[data-target-weight]").value,
    targetDate: editor.querySelector("[data-target-date]").value,
    notes: editor.querySelector("[data-goal-notes]").value,
  }));
}

function populateGoals(goals) {
  goals.forEach((goal) => {
    const editor = form.querySelector(`[data-goal][data-lift="${goal.lift}"]`);
    if (!editor) return;
    editor.querySelector("[data-goal-id]").value = goal.id;
    editor.querySelector("[data-current-weight]").value = goal.currentWeightKg || "";
    editor.querySelector("[data-target-weight]").value = goal.targetWeightKg || "";
    editor.querySelector("[data-target-date]").value = goal.targetDate;
    editor.querySelector("[data-goal-notes]").value = goal.notes;
  });
}

function showValidation(errors) {
  validationOutput.replaceChildren();
  validationOutput.hidden = errors.length === 0;
  if (errors.length === 0) return;
  const heading = document.createElement("strong");
  heading.textContent = "請修正以下內容：";
  const list = document.createElement("ul");
  errors.forEach((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    list.append(item);
  });
  validationOutput.append(heading, list);
  validationOutput.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function initialize() {
  let spreadsheet = appState.get("selectedSpreadsheet");
  const clientId = window.FitnessConfig?.googleSheets?.oauthClientId?.trim();
  const updateConnection = () => {
    const connected = Boolean(spreadsheet?.id);
    connectionMessage.textContent = connected
      ? `已選擇：${spreadsheet.name}`
      : "尚未連接 Google Sheet。請先回到 Dashboard 選擇或建立試算表。";
    loadButton.disabled = !connected;
  };
  updateConnection();
  window.addEventListener("fitness:state-change", (event) => {
    if (event.detail.key !== "selectedSpreadsheet") return;
    spreadsheet = event.detail.value;
    updateConnection();
  });
  if (!clientId) {
    connectionMessage.textContent = "網站尚未完成 Google OAuth 設定。";
    loadButton.disabled = true;
    return;
  }

  const oauth = googleAuth.configure(clientId);
  setBusy(true);
  try {
    await oauth.initialize();
    connectionMessage.textContent = `已選擇：${spreadsheet.name}`;
  } catch (error) {
    connectionMessage.textContent = describeError(error);
    setBusy(false);
    loadButton.disabled = true;
    return;
  }
  setBusy(false);
  updateConnection();

  loadButton.addEventListener("click", async () => {
    setBusy(true);
    connectionMessage.textContent = "正在載入訓練目標…";
    try {
      const token = await oauth.getAccessToken();
      await validateSpreadsheet(spreadsheet.id, token);
      const [rows] = await readRanges(spreadsheet.id, token, ["Goals"]);
      populateGoals(parseGoals(rows));
      connectPanel.hidden = true;
      form.hidden = false;
      setStatus("訓練目標已載入。若尚未設定，可填寫任一項目標重量。");
    } catch (error) {
      connectionMessage.textContent = describeError(error);
    } finally {
      setBusy(false);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const goals = readFormGoals();
    const errors = validateGoals(goals);
    showValidation(errors);
    if (errors.length > 0) return;

    setBusy(true);
    setStatus("正在儲存訓練目標…");
    try {
      const token = oauth.getValidAccessToken() ?? await oauth.requestAccessToken();
      const records = createGoalRecords(goals);
      await upsertGoals(spreadsheet.id, token, records);
      records.forEach((record) => {
        const editor = form.querySelector(`[data-goal][data-lift="${record.lift}"]`);
        editor.querySelector("[data-goal-id]").value = record.goal_id;
      });
      window.dispatchEvent(new CustomEvent("fitness:data-changed", { detail: { source: "goals" } }));
      setStatus("訓練目標已儲存到 Google Sheet。", "success");
    } catch (error) {
      console.error("Unable to save goals.", error);
      setStatus(describeError(error), "error");
    } finally {
      setBusy(false);
    }
  });
}

initialize();
