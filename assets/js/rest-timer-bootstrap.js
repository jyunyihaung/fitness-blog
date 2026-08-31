import { createRestTimer } from "./rest-timer.js";

export const QUICK_ADD_REST_SECONDS = {
  strength: 240,
  hypertrophy: 120,
  strengthHypertrophy: 180,
  volume: 120,
  endurance: 60,
  power: 180,
};

export const WARMUP_REST_SECONDS = 90;
export const ADD_RECORD_REST_SECONDS = 120;

function createTimerCard(attribute, description) {
  const root = document.createElement("section");
  root.className = "card rest-timer-card";
  root.setAttribute(attribute, "");
  root.setAttribute("aria-label", "組間休息倒數");
  root.innerHTML = `
    <div class="rest-timer-heading">
      <div>
        <p class="eyebrow">Rest Timer</p>
        <h2>組間休息</h2>
      </div>
      <strong class="rest-timer-clock" data-rest-time>02:00</strong>
    </div>
    <p class="rest-timer-note" data-rest-source>${description}</p>
    <p class="rest-timer-status" data-rest-status role="status" aria-live="polite"></p>
    <p class="rest-timer-note">目前預設：<strong data-rest-default>02:00</strong></p>
    <div class="rest-timer-actions">
      <button class="button primary" type="button" data-rest-start>開始</button>
      <button class="button" type="button" data-rest-pause>暫停</button>
      <button class="button" type="button" data-rest-minus>-30 秒</button>
      <button class="button" type="button" data-rest-plus>+30 秒</button>
      <button class="button" type="button" data-rest-reset>重設</button>
    </div>`;
  return root;
}

function setupRecordTimer() {
  const form = document.querySelector("[data-record-form]");
  const exercises = document.querySelector("[data-exercises]");
  if (!form || !exercises) return;
  const root = createTimerCard("data-record-rest-timer", "新增紀錄預設 2:00；倒數只在目前畫面使用，不會寫入訓練紀錄。");
  exercises.closest(".form-section")?.after(root);
  createRestTimer(root, { defaultSeconds: ADD_RECORD_REST_SECONDS });
}

function setupQuickAddTimer() {
  const page = document.querySelector("[data-route-page='/quick-add']");
  const preview = document.querySelector("[data-workout-preview]");
  const exercises = document.querySelector("[data-quick-exercises]");
  if (!page || !preview || !exercises) return;

  const root = createTimerCard("data-quick-rest-timer", "完成一組後會自動開始倒數；暖身組預設 1:30，工作組依訓練模式決定。");
  exercises.closest(".form-section")?.after(root);

  let selectedMode = "";
  const timer = createRestTimer(root, { defaultSeconds: 120 });

  page.addEventListener("click", (event) => {
    const modeChoice = event.target.closest("[data-choice-group='mode']");
    if (!modeChoice) return;
    selectedMode = modeChoice.dataset.choiceId || "";
    timer.setDefault(QUICK_ADD_REST_SECONDS[selectedMode] ?? 120);
    root.querySelector("[data-rest-source]").textContent = "工作組會依目前訓練模式自動帶入休息時間；暖身組固定 1:30。";
  });

  page.addEventListener("change", (event) => {
    if (!event.target.matches("[data-set-completed]") || !event.target.checked) return;
    const set = event.target.closest("[data-set]");
    if (!set) return;
    const isWarmup = set.querySelector("[data-set-warmup]")?.checked
      || set.querySelector("[data-set-type]")?.value === "warmup";
    const seconds = isWarmup
      ? WARMUP_REST_SECONDS
      : QUICK_ADD_REST_SECONDS[selectedMode] ?? 120;
    timer.start(seconds);
    root.querySelector("[data-rest-source]").textContent = isWarmup
      ? "已完成暖身組：自動開始 1:30 休息。"
      : "已完成工作組：依訓練模式自動開始休息。";
  });
}

setupRecordTimer();
setupQuickAddTimer();
