import { appState } from "./app-state.js";
import { googleAuth } from "./auth-service.js";
import { createTrainingPlanRecords } from "./training-plan-model.js";
import {
  createTrainingPlan, deletePlannedExercise, listTrainingPlanRecords,
  savePlannedExercise, updatePlannedWorkout, updateTrainingPlanMetadata,
} from "./training-plan-storage.js";
import { createBlankNormalizedPlan, formatPlannedItem, groupTrainingPlan, parseLocalPlanJson } from "./training-plan-view.js";

const page = document.querySelector("[data-training-plan-page]");
const status = page.querySelector("[data-plan-status]");
const help = page.querySelector("[data-plan-connection-help]");
const select = page.querySelector("[data-plan-select]");
const detailsForm = page.querySelector("[data-plan-details]");
const workspace = page.querySelector("[data-plan-workspace]");
const createForm = page.querySelector("[data-plan-create-form]");
const importForm = page.querySelector("[data-plan-import-form]");
const weekTabs = page.querySelector("[data-plan-week-tabs]");
const dayTabs = page.querySelector("[data-plan-day-tabs]");
const daySummary = page.querySelector("[data-plan-day-summary]");
const workoutForm = page.querySelector("[data-plan-workout-form]");
const itemList = page.querySelector("[data-plan-item-list]");
const itemForm = page.querySelector("[data-plan-item-form]");
const newItemButton = page.querySelector("[data-plan-new-item]");

let records = { plans: [], workouts: [], sets: [] };
let selectedPlanId = "";
let weekNumber = 1;
let dayNumber = 1;
let saving = false;

function field(form, name) {
  return form.elements.namedItem(name);
}

function showStatus(message, state = "idle") {
  status.textContent = message;
  status.dataset.state = state;
}

function showError(error, fallback = "操作失敗，請檢查 Google Sheet 的連線與資料結構。") {
  // Only display messages from our own domain/storage logic, never raw API payloads.
  const value = String(error?.message ?? "");
  const known = [
    "尚未啟用訓練計畫", "尚未完成訓練計畫", "重複", "不存在",
    "請先", "找不到", "格式不正確", "必須", "未知", "不支援", "缺少",
    "處方", "狀態不", "超出", "順序", "無法解析 JSON", "JSON 檔案過大",
    "僅支援", "訓練日", "次數", "重量", "計畫", "週數", "至少",
    "Google 授權失敗",
  ];
  showStatus(known.some((word) => value.includes(word)) ? value : fallback, "error");
}

function setBusy(next) {
  saving = next;
  page.querySelectorAll("button, input, select, textarea").forEach((control) => {
    control.disabled = next;
  });
}

function getConnection() {
  const spreadsheet = appState.get("selectedSpreadsheet");
  if (!spreadsheet?.id) throw new Error("請先選擇 Google Sheet。");
  return spreadsheet;
}

async function getCredentials() {
  const sheet = getConnection();
  const token = googleAuth.getValidAccessToken() ?? await googleAuth.getAccessToken();
  if (!token) throw new Error("Google 授權失敗，請重新連線。");
  return { spreadsheetId: sheet.id, token };
}

function textNode(tag, value, className = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = value;
  return el;
}

function actionButton(label, attr, id) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button compact-button";
  button.textContent = label;
  button.dataset[attr] = id;
  return button;
}

function current() {
  return groupTrainingPlan(records, selectedPlanId);
}

function selectedDay() {
  return current()?.weeks.find((week) => week.week === weekNumber)
    ?.workouts.find((day) => Number(day.day_number) === dayNumber) ?? null;
}

function renderSelect() {
  const previous = selectedPlanId;
  select.replaceChildren();
  select.append(new Option("請選擇計畫", ""));
  for (const plan of records.plans) {
    select.append(new Option(plan.title + " · " + ({ draft: "草稿", active: "使用中", archived: "已封存" }[plan.status] ?? plan.status), plan.plan_id));
  }
  selectedPlanId = records.plans.some((plan) => plan.plan_id === previous)
    ? previous : (records.plans[0]?.plan_id ?? "");
  select.value = selectedPlanId;
}

function renderTabs(container, data, selected, label) {
  container.replaceChildren();
  for (const entry of data) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button compact-button";
    button.textContent = entry.text;
    button.dataset[label] = String(entry.value);
    button.setAttribute("aria-pressed", String(entry.value === selected));
    if (entry.value === selected) button.classList.add("primary");
    container.append(button);
  }
}

function renderDay() {
  const day = selectedDay();
  itemForm.hidden = true;
  itemList.replaceChildren();
  daySummary.replaceChildren();
  workoutForm.hidden = !day;
  newItemButton.disabled = !day || day.status !== "planned";
  if (!day) {
    daySummary.append(textNode("p", "本週沒有提供這一天的課表。", "empty-state"));
    return;
  }
  const provided = day.status === "planned";
  daySummary.append(textNode("p", (provided ? "已有處方" : "尚未提供") +
    (day.planned_date ? " · " + day.planned_date : "") +
    " · " + day.items.length + " 個項目", "section-lede"));
  field(workoutForm, "title").value = day.title;
  field(workoutForm, "status").value = day.status;
  field(workoutForm, "planned_date").value = day.planned_date ?? "";
  field(workoutForm, "notes").value = day.notes ?? "";
  if (day.notes) daySummary.append(textNode("p", day.notes, "plan-day-notes"));
  if (!day.items.length) {
    itemList.append(textNode("p", provided
      ? "尚無動作；可按「新增動作」建立處方。"
      : "這一天尚未提供訓練內容；若要加入動作，請先修改上方狀態並儲存。", "empty-state"));
    return;
  }
  const list = document.createElement("ol");
  list.className = "plan-prescription-list";
  for (const item of day.items) {
    const li = document.createElement("li");
    li.className = "plan-prescription";
    const information = document.createElement("div");
    information.append(textNode("strong", item.exercise_name));
    information.append(textNode("p", formatPlannedItem(item), "plan-item-detail"));
    if (item.coach_notes) information.append(textNode("p", item.coach_notes, "plan-item-notes"));
    if (item.reps_kind === "needs_review" || item.load_kind === "needs_review") {
      information.append(textNode("p", "需人工確認原始教練處方", "plan-item-warning"));
    }
    const actions = document.createElement("div");
    actions.className = "plan-item-actions";
    actions.append(actionButton("編輯", "planEditItem", item.planned_set_id),
      actionButton("刪除", "planDeleteItem", item.planned_set_id));
    li.append(information, actions);
    list.append(li);
  }
  itemList.append(list);
}

function renderPlan() {
  const plan = current();
  detailsForm.hidden = !plan;
  workspace.hidden = !plan;
  if (!plan) return;
  field(detailsForm, "title").value = plan.title;
  field(detailsForm, "status").value = plan.status;
  field(detailsForm, "notes").value = plan.notes ?? "";
  if (weekNumber > plan.weeks.length || !plan.weeks.some((week) => week.week === weekNumber)) weekNumber = 1;
  renderTabs(weekTabs, plan.weeks.map((week) => ({
    value: week.week, text: "Week " + week.week +
      (week.workouts.every((day) => day.status === "not_provided") ? " (未提供)" : ""),
  })), weekNumber, "planWeek");
  const days = plan.weeks.find((w) => w.week === weekNumber)?.workouts ?? [];
  if (!days.some((day) => Number(day.day_number) === dayNumber)) dayNumber = Number(days[0]?.day_number ?? 1);
  renderTabs(dayTabs, days.map((day) => ({
    value: Number(day.day_number), text: "Day " + day.day_number,
  })), dayNumber, "planDay");
  renderDay();
}

async function reload(preferredPlanId = selectedPlanId) {
  const { spreadsheetId, token } = await getCredentials();
  records = await listTrainingPlanRecords(spreadsheetId, token);
  selectedPlanId = preferredPlanId;
  renderSelect();
  renderPlan();
  help.hidden = true;
  showStatus("已載入 " + records.plans.length + " 份訓練計畫。", "success");
}

async function operation(handler) {
  if (saving) return;
  setBusy(true);
  try {
    await handler();
  } catch (error) {
    const message = String(error?.message ?? "");
    help.hidden = !message.includes("尚未啟用") && !message.includes("尚未完成");
    showError(error);
  } finally {
    setBusy(false);
    newItemButton.disabled = !selectedDay() || selectedDay().status !== "planned";
  }
}

page.querySelector("[data-plan-refresh]").addEventListener("click", () => {
  operation(async () => { await reload(); });
});

select.addEventListener("change", () => {
  selectedPlanId = select.value;
  weekNumber = 1;
  dayNumber = 1;
  renderPlan();
});

weekTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-plan-week]");
  if (!button) return;
  weekNumber = Number(button.dataset.planWeek);
  dayNumber = 1;
  renderPlan();
});

dayTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-plan-day]");
  if (!button) return;
  dayNumber = Number(button.dataset.planDay);
  renderPlan();
});

createForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!createForm.reportValidity()) return;
  operation(async () => {
    const normalized = createBlankNormalizedPlan(field(createForm, "weekCount").value,
      field(createForm, "dayCount").value);
    const title = field(createForm, "title").value.trim();
    const plan = createTrainingPlanRecords(normalized, { title });
    const { spreadsheetId, token } = await getCredentials();
    await createTrainingPlan(spreadsheetId, token, plan);
    weekNumber = 1;
    dayNumber = 1;
    await reload(plan.plan.plan_id);
    showStatus("已建立空白訓練計畫。", "success");
  });
});

importForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const file = field(importForm, "planFile").files?.[0];
  if (!file) return showStatus("請先選擇 Phase 0 的 JSON 檔案。", "error");
  if (file.size > 1024 * 1024) return showStatus("JSON 檔案過大（上限 1 MB）。", "error");
  operation(async () => {
    const { spreadsheetId, token } = await getCredentials();
    const normalized = parseLocalPlanJson(await file.text());
    // Preserve unknown/review-required prescriptions for coach confirmation.
    const plan = createTrainingPlanRecords(normalized, { title: field(createForm, "title").value.trim() });
    await createTrainingPlan(spreadsheetId, token, plan);
    field(importForm, "planFile").value = "";
    weekNumber = 1;
    dayNumber = 1;
    await reload(plan.plan.plan_id);
    showStatus("已匯入課表。請檢查「待確認」的動作。", "success");
  });
});

detailsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!detailsForm.reportValidity() || !selectedPlanId) return;
  operation(async () => {
    const { spreadsheetId, token } = await getCredentials();
    await updateTrainingPlanMetadata(spreadsheetId, token, selectedPlanId, {
      title: field(detailsForm, "title").value.trim(),
      status: field(detailsForm, "status").value,
      notes: field(detailsForm, "notes").value.trim(),
    });
    await reload();
    showStatus("計畫資訊已儲存。", "success");
  });
});

workoutForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!workoutForm.reportValidity()) return;
  const workoutId = selectedDay()?.workout_id;
  if (!workoutId) return;
  operation(async () => {
    const { spreadsheetId, token } = await getCredentials();
    await updatePlannedWorkout(spreadsheetId, token, workoutId, {
      title: field(workoutForm, "title").value.trim(),
      status: field(workoutForm, "status").value,
      planned_date: field(workoutForm, "planned_date").value,
      notes: field(workoutForm, "notes").value.trim(),
    });
    await reload();
    showStatus("訓練日資訊已儲存。", "success");
  });
});

function toggleItemFields() {
  const repsKind = field(itemForm, "reps_kind").value;
  const loadKind = field(itemForm, "load_kind").value;
  const activity = field(itemForm, "item_kind").value === "activity";
  itemForm.querySelectorAll("[data-reps-field]").forEach((wrap) => {
    wrap.hidden = !wrap.dataset.repsField.split(" ").includes(repsKind);
  });
  itemForm.querySelectorAll("[data-load-field]").forEach((wrap) => {
    wrap.hidden = !wrap.dataset.loadField.split(" ").includes(loadKind);
  });
  itemForm.querySelector("[data-steps-field]").hidden = !activity;
}

function openItem(item = null) {
  const day = selectedDay();
  if (!day || day.status !== "planned") return;
  itemForm.reset();
  for (const name of [
    "planned_set_id", "exercise_name", "item_kind", "exercise_order", "target_sets",
    "reps_kind", "reps_value", "reps_min", "reps_max", "reps_rpe", "reps_raw",
    "load_kind", "load_value", "load_unit", "load_operator", "load_rpe", "load_raw",
    "target_minimum", "coach_notes",
  ]) {
    const control = field(itemForm, name);
    if (item && Object.hasOwn(item, name)) control.value = item[name];
  }
  if (!item) {
    field(itemForm, "item_kind").value = "exercise";
    field(itemForm, "reps_kind").value = "unspecified";
    field(itemForm, "load_kind").value = "unspecified";
    field(itemForm, "load_unit").value = "kg";
    field(itemForm, "load_operator").value = "<";
    field(itemForm, "exercise_order").value =
      Math.max(0, ...day.items.map((entry) => Number(entry.exercise_order))) + 1;
  }
  itemForm.querySelector("[data-plan-item-form-title]").textContent = item ? "編輯動作處方" : "新增動作處方";
  toggleItemFields();
  itemForm.hidden = false;
  field(itemForm, "exercise_name").focus();
}

newItemButton.addEventListener("click", () => openItem());
itemForm.querySelectorAll("[name='reps_kind'], [name='load_kind'], [name='item_kind']").forEach((control) => {
  control.addEventListener("change", toggleItemFields);
});
page.querySelector("[data-plan-cancel-item]").addEventListener("click", () => { itemForm.hidden = true; });

itemList.addEventListener("click", (event) => {
  const editId = event.target.closest("[data-plan-edit-item]")?.dataset.planEditItem;
  if (editId) return openItem(selectedDay()?.items.find((item) => item.planned_set_id === editId));
  const deleteId = event.target.closest("[data-plan-delete-item]")?.dataset.planDeleteItem;
  const day = selectedDay();
  if (!deleteId || !day) return;
  const item = day.items.find((entry) => entry.planned_set_id === deleteId);
  if (!item || !window.confirm("確定從課表刪除「" + item.exercise_name + "」？這不會刪除已完成的訓練紀錄。")) return;
  operation(async () => {
    const { spreadsheetId, token } = await getCredentials();
    await deletePlannedExercise(spreadsheetId, token, day.workout_id, deleteId);
    await reload();
    showStatus("已從課表刪除動作。", "success");
  });
});

itemForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!itemForm.reportValidity()) return;
  const day = selectedDay();
  if (!day) return;
  operation(async () => {
    const { spreadsheetId, token } = await getCredentials();
    const repsKind = field(itemForm, "reps_kind").value;
    const loadKind = field(itemForm, "load_kind").value;
    const input = {
      planned_set_id: field(itemForm, "planned_set_id").value,
      exercise_name: field(itemForm, "exercise_name").value.trim(),
      item_kind: field(itemForm, "item_kind").value,
      exercise_order: field(itemForm, "exercise_order").value,
      target_sets: field(itemForm, "target_sets").value,
      reps_kind: repsKind,
      reps_value: repsKind === "fixed" ? field(itemForm, "reps_value").value : "",
      reps_min: repsKind === "range" ? field(itemForm, "reps_min").value : "",
      reps_max: repsKind === "range" ? field(itemForm, "reps_max").value : "",
      reps_rpe: repsKind === "until_rpe" ? field(itemForm, "reps_rpe").value : "",
      reps_raw: repsKind === "needs_review" ? field(itemForm, "reps_raw").value : "",
      load_kind: loadKind,
      load_value: ["fixed", "bounded"].includes(loadKind) ? field(itemForm, "load_value").value : "",
      load_unit: ["fixed", "bounded"].includes(loadKind) ? field(itemForm, "load_unit").value : "",
      load_operator: loadKind === "bounded" ? field(itemForm, "load_operator").value : "",
      load_rpe: loadKind === "rpe_target" ? field(itemForm, "load_rpe").value : "",
      load_raw: loadKind === "needs_review" ? field(itemForm, "load_raw").value : "",
      target_metric: field(itemForm, "item_kind").value === "activity" &&
        field(itemForm, "target_minimum").value ? "steps" : "",
      target_minimum: field(itemForm, "item_kind").value === "activity" ?
        field(itemForm, "target_minimum").value : "",
      coach_notes: field(itemForm, "coach_notes").value.trim(),
    };
    await savePlannedExercise(spreadsheetId, token, day.workout_id, input);
    await reload();
    showStatus("動作處方已儲存。", "success");
  });
});

window.addEventListener("fitness:route-change", (event) => {
  if (event.detail.route !== "/training-plan") return;
  if (googleAuth.getValidAccessToken() && appState.get("selectedSpreadsheet")?.id) {
    operation(async () => { await reload(); });
  } else {
    showStatus("請先連線 Google Sheet，再按「重新整理」載入訓練課表。");
  }
});
window.addEventListener("fitness:state-change", (event) => {
  if (event.detail.key !== "selectedSpreadsheet") return;
  records = { plans: [], workouts: [], sets: [] };
  selectedPlanId = "";
  renderSelect();
  renderPlan();
});
renderSelect();
renderPlan();
