import { formatRestTime, remainingRestSeconds } from "./rest-timer.js";

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

function isWarmupSet(set) {
  return Boolean(set?.querySelector("[data-set-warmup]")?.checked)
    || set?.querySelector("[data-set-type]")?.value === "warmup";
}

function isLastSetInExercise(set) {
  const exercise = set?.closest("[data-exercise]");
  const sets = exercise ? Array.from(exercise.querySelectorAll("[data-set]")) : [];
  return sets.length > 0 && sets[sets.length - 1] === set;
}

function createInlineRestManager(page, {
  defaultSeconds = ADD_RECORD_REST_SECONDS,
  getSeconds = () => defaultSeconds,
  autoStartOnComplete = false,
} = {}) {
  let activeSet = null;
  let endsAt = null;
  let remainingSeconds = defaultSeconds;
  let paused = false;
  let intervalId = null;

  function clearTicker() {
    if (intervalId !== null) window.clearInterval(intervalId);
    intervalId = null;
  }

  function controls(set) {
    const root = set?.querySelector("[data-inline-rest]");
    return root ? {
      root,
      summary: root.querySelector(".inline-rest-summary"),
      active: root.querySelector("[data-inline-rest-active]"),
      defaultOutput: root.querySelector("[data-inline-rest-default]"),
      time: root.querySelector("[data-inline-rest-time]"),
      status: root.querySelector("[data-inline-rest-status]"),
      pause: root.querySelector("[data-inline-rest-pause]"),
    } : null;
  }

  function secondsFor(set) {
    const seconds = Number(getSeconds(set));
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : defaultSeconds;
  }

  function updateDefaults() {
    page.querySelectorAll("[data-set]").forEach((set) => {
      const ui = controls(set);
      if (ui) ui.defaultOutput.textContent = formatRestTime(secondsFor(set));
    });
  }

  function collapse(set, status = "") {
    const ui = controls(set);
    if (!ui) return;
    ui.active.hidden = true;
    ui.summary.hidden = false;
    ui.root.dataset.restState = status === "finished" ? "finished" : "idle";
    if (status === "finished") {
      ui.summary.querySelector("span").innerHTML = "✓ 休息完成";
      ui.summary.querySelector("[data-inline-rest-start]").textContent = "再次休息";
    }
  }

  function restoreSummary(set) {
    const ui = controls(set);
    if (!ui) return;
    ui.summary.querySelector("span").innerHTML = `組間休息 <strong data-inline-rest-default>${formatRestTime(secondsFor(set))}</strong>`;
    ui.summary.querySelector("[data-inline-rest-start]").textContent = "開始";
  }

  function render() {
    if (!activeSet) return;
    const ui = controls(activeSet);
    if (!ui) {
      stop();
      return;
    }
    if (endsAt !== null && !paused) remainingSeconds = remainingRestSeconds(endsAt);
    ui.time.textContent = formatRestTime(remainingSeconds);
    ui.pause.textContent = paused ? "繼續" : "暫停";
    ui.root.dataset.restState = paused ? "paused" : remainingSeconds <= 0 ? "finished" : "running";
    ui.status.textContent = paused ? "倒數已暫停。" : remainingSeconds <= 0 ? "休息完成，可以開始下一組。" : "休息倒數中。";
    if (remainingSeconds <= 0 && !paused) {
      clearTicker();
      const finishedSet = activeSet;
      activeSet = null;
      endsAt = null;
      window.setTimeout(() => collapse(finishedSet, "finished"), 900);
    }
  }

  function stop({ restore = false } = {}) {
    clearTicker();
    if (activeSet) {
      if (restore) restoreSummary(activeSet);
      collapse(activeSet);
    }
    activeSet = null;
    endsAt = null;
    paused = false;
  }

  function start(set) {
    if (!set) return;
    if (activeSet && activeSet !== set) stop({ restore: true });
    restoreSummary(set);
    activeSet = set;
    remainingSeconds = secondsFor(set);
    endsAt = Date.now() + remainingSeconds * 1000;
    paused = false;
    const ui = controls(set);
    ui.summary.hidden = true;
    ui.active.hidden = false;
    clearTicker();
    intervalId = window.setInterval(render, 250);
    render();
  }

  function pauseOrResume() {
    if (!activeSet) return;
    if (paused) {
      endsAt = Date.now() + remainingSeconds * 1000;
      paused = false;
      clearTicker();
      intervalId = window.setInterval(render, 250);
    } else {
      remainingSeconds = remainingRestSeconds(endsAt);
      endsAt = null;
      paused = true;
      clearTicker();
    }
    render();
  }

  function adjust(delta) {
    if (!activeSet) return;
    const adjustment = Number(delta);
    if (endsAt !== null && !paused) {
      remainingSeconds = Math.max(0, remainingRestSeconds(endsAt) + adjustment);
      endsAt = Date.now() + remainingSeconds * 1000;
    } else {
      remainingSeconds = Math.max(0, remainingSeconds + adjustment);
    }
    render();
  }

  function reset() {
    if (!activeSet) return;
    start(activeSet);
  }

  page.addEventListener("click", (event) => {
    const set = event.target.closest("[data-set]");
    if (!set) return;
    if (event.target.closest("[data-inline-rest-start]")) start(set);
    else if (event.target.closest("[data-inline-rest-pause]")) pauseOrResume();
    else if (event.target.closest("[data-inline-rest-minus]")) adjust(-30);
    else if (event.target.closest("[data-inline-rest-plus]")) adjust(30);
    else if (event.target.closest("[data-inline-rest-reset]")) reset();
  });

  if (autoStartOnComplete) {
    page.addEventListener("change", (event) => {
      if (!event.target.matches("[data-set-completed]") || !event.target.checked) return;
      const set = event.target.closest("[data-set]");
      if (!set || isLastSetInExercise(set)) return;
      start(set);
    });
  }

  page.addEventListener("change", (event) => {
    if (event.target.matches("[data-set-type], [data-set-warmup]")) updateDefaults();
  });
  page.addEventListener("click", () => window.queueMicrotask(updateDefaults));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) render();
  });

  updateDefaults();
  return { start, stop, updateDefaults };
}

function setupRecordTimers() {
  const page = document.querySelector("[data-route-page='/record/new']") || document.querySelector("[data-record-form]");
  if (!page) return;
  createInlineRestManager(page, { defaultSeconds: ADD_RECORD_REST_SECONDS });
}

function setupQuickAddTimers() {
  const page = document.querySelector("[data-route-page='/quick-add']");
  if (!page) return;
  let selectedMode = "";
  const manager = createInlineRestManager(page, {
    defaultSeconds: 120,
    autoStartOnComplete: true,
    getSeconds: (set) => isWarmupSet(set)
      ? WARMUP_REST_SECONDS
      : QUICK_ADD_REST_SECONDS[selectedMode] ?? 120,
  });

  page.addEventListener("click", (event) => {
    const modeChoice = event.target.closest("[data-choice-group='mode']");
    if (!modeChoice) return;
    selectedMode = modeChoice.dataset.choiceId || "";
    window.queueMicrotask(manager.updateDefaults);
  });
}

if (typeof document !== "undefined") {
  setupRecordTimers();
  setupQuickAddTimers();
}
