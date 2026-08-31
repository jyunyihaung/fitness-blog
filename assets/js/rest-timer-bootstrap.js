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

function setupRecordTimer() {
  const root = document.querySelector("[data-record-rest-timer]");
  if (!root) return;
  createRestTimer(root, { defaultSeconds: ADD_RECORD_REST_SECONDS });
}

function setupQuickAddTimer() {
  const root = document.querySelector("[data-quick-rest-timer]");
  const page = document.querySelector("[data-route-page='/quick-add']");
  if (!root || !page) return;

  let selectedMode = "";
  const timer = createRestTimer(root, { defaultSeconds: 120 });

  page.addEventListener("click", (event) => {
    const modeChoice = event.target.closest("[data-choice-group='mode']");
    if (!modeChoice) return;
    selectedMode = modeChoice.dataset.choiceId || "";
    timer.setDefault(QUICK_ADD_REST_SECONDS[selectedMode] ?? 120);
    const label = root.querySelector("[data-rest-source]");
    if (label) label.textContent = "工作組會依目前訓練模式自動帶入休息時間。";
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
    const label = root.querySelector("[data-rest-source]");
    if (label) label.textContent = isWarmup
      ? "已完成暖身組：自動開始 1:30 休息。"
      : "已完成工作組：依訓練模式自動開始休息。";
  });
}

setupRecordTimer();
setupQuickAddTimer();
