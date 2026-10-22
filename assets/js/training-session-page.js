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

function showStatus(message, state = "idle") {
  output.textContent = message;
  output.dataset.state = state;
}

function setBusy(value) {
  busy = value;
  panel.querySelectorAll("button, input, select, textarea").forEach((el) => {
    el.disabled = value;
  });
}

function end({ saved = false } = {}) {
  if (!active) return;
  active = null;
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
    panel.hidden = false;
    showStatus("請填入實際執行內容，勾選完成的組數後再儲存。");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showStatus(safeErrorMessage(error, "無法開始此訓練日。"), "error");
  }
});

page.querySelector("[data-plan-run-cancel]").addEventListener("click", () => {
  if (!active || busy) return;
  if (window.confirm("返回課表會放棄尚未儲存的實際訓練內容，確定返回？")) end();
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
    return showStatus("已切換 Google Sheet；請返回課表重新開始以避免寫入錯誤資料。", "error");
  }
  let prepared;
  try {
    prepared = prepareCompletedPlannedWorkout(active.draft, editor.read(), {
      sessionId: active.sessionId,
      trainingDate: form.elements.namedItem("training_date").value,
      durationMinutes: form.elements.namedItem("duration_minutes").value,
      notes: form.elements.namedItem("notes").value,
    });
  } catch (error) {
    return showStatus(String(error.message || "請確認實際完成的組數。"), "error");
  }
  setBusy(true);
  showStatus("正在儲存已完成組數…");
  try {
    const token = googleAuth.getValidAccessToken() ?? await googleAuth.getAccessToken();
    const result = await appendLinkedWorkoutRecord(active.spreadsheetId, token, prepared.records);
    // The linked workout itself is already safe if exercise master sync fails.
    if (!result.alreadyExists) {
      try {
        appState.set("exercises", await syncUsedExercises(active.spreadsheetId, token, prepared.input.exercises));
      } catch (_) {
        showStatus("訓練紀錄已儲存，但動作清單同步失敗；原始紀錄不受影響。", "success");
      }
    }
    window.dispatchEvent(new CustomEvent("fitness:data-changed", {
      detail: { source: "training-plan", sessionId: result.sessionId },
    }));
    showStatus(result.alreadyExists ? "已存在相同工作階段紀錄，沒有重複寫入。" : "已完成儲存。", "success");
    end({ saved: true });
    window.location.hash = "/records";
  } catch (error) {
    reportAppError("save-linked-training-session", error);
    showStatus(safeErrorMessage(error, "儲存失敗，請重試。完成組數及訓練 ID 均已保留。"), "error");
  } finally {
    setBusy(false);
  }
});

window.addEventListener("fitness:state-change", (event) => {
  if (event.detail.key === "exercises") editor.setExerciseOptions(event.detail.value);
  if (event.detail.key === "selectedSpreadsheet" && active &&
      event.detail.value?.id !== active.spreadsheetId) {
    showStatus("目前選擇的試算表已變更；請放棄草稿並重新從課表開始。", "error");
  }
});

window.addEventListener("fitness:route-change", (event) => {
  if (event.detail.route !== "/training-plan" && active && !busy) end();
});
