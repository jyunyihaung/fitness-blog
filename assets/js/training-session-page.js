// Phase 3 workout execution lives only in memory until user explicitly saves
// completed sets. Credentials, plan drafts and training logs are never placed
// into localStorage.
import { appState } from "./app-state.js";
import { googleAuth } from "./auth-service.js";
import { appendLinkedWorkoutRecord, syncUsedExercises } from "./google-sheets.js";
import { createWorkoutEditor } from "./workout-editor.js";
import { buildPlannedTrainingDraft, prepareCompletedPlannedWorkout } from "./training-session-domain.js";
import { reportAppError, safeErrorMessage } from "./app-error.js";

const page = document.querySelector("[data-training-plan-page]");
const panel = page.querySelector("[data-plan-runner]");
const form = page.querySelector("[data-plan-run-form]");
const output = page.querySelector("[data-plan-run-status]");
const source = page.querySelector("[data-plan-run-source]");
const excluded = page.querySelector("[data-plan-run-skipped]");
const editor = createWorkoutEditor(page.querySelector("[data-plan-run-exercises]"), {
  completionEnabled: true, executionMode: true,
});
const managerSections = [
  page.querySelector("[data-plan-create-form]")?.closest("section"),
  page.querySelector("[data-plan-select]")?.closest("section"),
  page.querySelector("[data-plan-workspace]"),
].filter(Boolean);
const add = page.querySelector("[data-plan-run-add]");
let active = null;
let busy = false;
let pending = null;
const reconnect = page.querySelector("[data-plan-run-reconnect]");
const schemaHelp = page.querySelector("[data-plan-run-help]");
const review = page.querySelector("[data-plan-run-review]");
const save = page.querySelector("[data-plan-run-save]");

function renderActive() {
  page.dataset.trainingActive = String(Boolean(active));
  panel.hidden = !active;
  if (active) managerSections.forEach(section => { section.hidden = true; });
  setBusy(busy);
}

function sameSpreadsheet() {
  return appState.get("selectedSpreadsheet")?.id === active?.spreadsheetId;
}

function showStatus(message, state = "idle") {
  output.textContent = message;
  output.dataset.state = state;
}

function setBusy(value) {
  busy = value;
  panel.querySelectorAll("button, input, select, textarea").forEach((el) => {
    el.disabled = value;
  });
  // Freeze the first submission until its outcome has been reconciled. Never
  // silently discard edits made after a response was lost.
  if (pending) form.querySelectorAll("input, select, textarea, button").forEach(el => { el.disabled = true; });
  save.disabled = value;
  save.textContent = pending ? "確認儲存結果／重試" : "儲存已完成組數";
}

function end({ saved = false } = {}) {
  if (!active) return;
  active = null;
  pending = null;
  page.dataset.trainingActive = "false";
  reconnect.hidden = schemaHelp.hidden = review.hidden = true;
  window.dispatchEvent(new CustomEvent("fitness:training-plan-stop"));
  panel.hidden = true;
  managerSections.forEach((section) => { section.hidden = false; });
  editor.load([]);
  window.dispatchEvent(new CustomEvent("fitness:training-plan-exit", { detail: { saved } }));
}

window.addEventListener("fitness:training-plan-start", (event) => {
  if (active || busy) return;
  try {
    const { plan, workout, spreadsheetId } = event.detail ?? {};
    const draft = buildPlannedTrainingDraft(plan, workout);
    active = {
      draft, spreadsheetId,
      sessionId: crypto.randomUUID(),
    };
    editor.load(draft.exercises);
    editor.setExerciseOptions(appState.get("exercises"));
    form.elements.namedItem("training_date").value = draft.trainingDate;
    form.elements.namedItem("duration_minutes").value = draft.durationMinutes;
    form.elements.namedItem("notes").value = "";
    source.textContent = draft.planTitle + " · Week " + workout.week_number +
      " · Day " + workout.day_number + " · " + draft.title;
    excluded.hidden = !draft.skipped.length;
    excluded.textContent = draft.skipped.length
      ? "活動目標（例如步數）不會當作重量訓練組數儲存：" + draft.skipped.join("、")
      : "";
    managerSections.forEach((section) => { section.hidden = true; });
    renderActive();
    setBusy(false);
    showStatus("請填入實際執行內容，勾選完成的組數後再儲存。");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showStatus(safeErrorMessage(error, "無法開始此訓練日。"), "error");
  }
});

page.querySelector("[data-plan-run-cancel]").addEventListener("click", () => {
  if (!active || busy) return;
  if (window.confirm(pending
    ? "儲存結果尚待核對，可能已寫入。請先查看紀錄；仍要放棄此草稿並返回課表？"
    : "返回課表會放棄尚未儲存的實際訓練內容，確定返回？")) end();
});

add.addEventListener("click", () => {
  if (!active || busy) return;
  const exercise = editor.addExercise();
  exercise.querySelector("[data-exercise-name]").focus();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!active || busy) return;
  const selectedSpreadsheet = appState.get("selectedSpreadsheet");
  if (!selectedSpreadsheet?.id || selectedSpreadsheet.id !== active.spreadsheetId) {
    return showStatus("已切換 Google Sheet；草稿仍保留，請切回原試算表後再儲存。", "error");
  }
  let prepared = pending;
  try {
    prepared ??= prepareCompletedPlannedWorkout(active.draft, editor.read(), {
      sessionId: active.sessionId,
      trainingDate: form.elements.namedItem("training_date").value,
      durationMinutes: form.elements.namedItem("duration_minutes").value,
      notes: form.elements.namedItem("notes").value,
    });
  } catch (error) {
    return showStatus(String(error.message || "請確認實際完成的組數。"), "error");
  }
  pending = prepared;
  setBusy(true);
  reconnect.hidden = schemaHelp.hidden = review.hidden = true;
  showStatus("正在儲存或確認先前儲存結果…");
  try {
    const token = googleAuth.getValidAccessToken() ?? await googleAuth.getAccessToken();
    if (!sameSpreadsheet()) {
      showStatus("已切換 Google Sheet，未送出儲存；請切回原試算表後重試。", "error");
      return;
    }
    const activeSpreadsheetId = active.spreadsheetId;
    const result = await appendLinkedWorkoutRecord(activeSpreadsheetId, token, prepared.records);
    // The linked workout itself is already safe if exercise master sync fails.
    if (!result.alreadyExists && sameSpreadsheet()) {
      try {
        appState.set("exercises", await syncUsedExercises(active.spreadsheetId, token, prepared.input.exercises));
      } catch (_) {
        showStatus("訓練紀錄已儲存，但動作清單同步失敗；原始紀錄不受影響。", "success");
      }
    }
    if (!sameSpreadsheet()) {
      showStatus("原試算表的訓練已儲存。請切回原試算表後確認結果；目前草稿已保留。", "success");
      return;
    }
    window.dispatchEvent(new CustomEvent("fitness:data-changed", {
      detail: { source: "training-plan", sessionId: result.sessionId },
    }));
    showStatus(result.alreadyExists ? "已存在相同工作階段紀錄，沒有重複寫入。" : "已完成儲存。", "success");
    end({ saved: true });
    window.location.hash = "/records";
    // A user may already be on the records route (or the hash may not
    // trigger a change). Notify it to refresh only after the save settles.
    window.dispatchEvent(new CustomEvent("fitness:record-saved", {
      detail: { sessionId: result.sessionId, spreadsheetId: activeSpreadsheetId },
    }));
  } catch (error) {
    reportAppError("save-linked-training-session", error);
    if (error.code === "authorization_expired" || error.code === "permission_denied") {
      googleAuth.clear();
      reconnect.hidden = false;
    }
    schemaHelp.hidden = error.code !== "linked_schema_missing";
    review.hidden = !pending;
    showStatus(safeErrorMessage(error, "無法確認儲存結果，請檢查連線後重試。")
      + " 首次送出的內容已保留並暫停編輯，請按「確認儲存結果／重試」。", "error");
  } finally {
    setBusy(false);
  }
});

window.addEventListener("fitness:state-change", (event) => {
  if (event.detail.key === "exercises") editor.setExerciseOptions(event.detail.value);
  if (event.detail.key === "selectedSpreadsheet" && active &&
      event.detail.value?.id !== active.spreadsheetId) {
    showStatus("目前選擇的試算表已變更；草稿仍保留，請切回原試算表後繼續。", "error");
  }
  if (active) renderActive();
});

reconnect.addEventListener("click", async () => {
  if (!active || busy) return;
  if (!sameSpreadsheet()) return showStatus("請先切回原試算表，再重新連線。", "error");
  setBusy(true);
  try {
    await googleAuth.requestAccessToken();
    reconnect.hidden = true;
    showStatus("已重新連線，草稿保留。請按儲存按鈕重試。");
  } catch (error) {
    showStatus(safeErrorMessage(error, "重新連線失敗，草稿仍保留。"), "error");
  } finally { setBusy(false); }
});

window.addEventListener("fitness:route-change", (event) => {
  if (active && event.detail.route === "/training-plan") renderActive();
});

window.addEventListener("beforeunload", (event) => {
  if (!active) return;
  event.preventDefault();
  event.returnValue = "";
});
