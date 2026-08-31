export function normalizeRestSeconds(value, fallback = 120) {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds) || seconds < 1) return fallback;
  return seconds;
}

export function formatRestTime(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function remainingRestSeconds(endsAt, now = Date.now()) {
  const end = Number(endsAt);
  const current = Number(now);
  if (!Number.isFinite(end) || !Number.isFinite(current)) return 0;
  return Math.max(0, Math.ceil((end - current) / 1000));
}

export function createRestTimer(root, { defaultSeconds = 120, tickMs = 250 } = {}) {
  if (!root) return null;

  const timeOutput = root.querySelector("[data-rest-time]");
  const statusOutput = root.querySelector("[data-rest-status]");
  const startButton = root.querySelector("[data-rest-start]");
  const pauseButton = root.querySelector("[data-rest-pause]");
  const resetButton = root.querySelector("[data-rest-reset]");
  const minusButton = root.querySelector("[data-rest-minus]");
  const plusButton = root.querySelector("[data-rest-plus]");
  const defaultOutput = root.querySelector("[data-rest-default]");

  let configuredSeconds = normalizeRestSeconds(defaultSeconds);
  let remainingSeconds = configuredSeconds;
  let endsAt = null;
  let paused = false;
  let intervalId = null;

  function clearTicker() {
    if (intervalId !== null) window.clearInterval(intervalId);
    intervalId = null;
  }

  function render() {
    if (endsAt !== null && !paused) remainingSeconds = remainingRestSeconds(endsAt);
    timeOutput.textContent = formatRestTime(remainingSeconds);
    if (defaultOutput) defaultOutput.textContent = formatRestTime(configuredSeconds);

    const finished = endsAt !== null && !paused && remainingSeconds <= 0;
    root.dataset.restState = finished ? "finished" : paused ? "paused" : endsAt !== null ? "running" : "idle";
    startButton.textContent = endsAt === null ? "開始" : finished ? "重新開始" : "重新開始";
    pauseButton.textContent = paused ? "繼續" : "暫停";
    pauseButton.disabled = endsAt === null || finished;
    resetButton.disabled = endsAt === null && remainingSeconds === configuredSeconds;

    if (finished) {
      clearTicker();
      statusOutput.textContent = "休息完成，可以開始下一組。";
    } else if (paused) {
      statusOutput.textContent = "倒數已暫停。";
    } else if (endsAt !== null) {
      statusOutput.textContent = "休息倒數中。";
    } else {
      statusOutput.textContent = "準備開始組間休息。";
    }
  }

  function ensureTicker() {
    clearTicker();
    intervalId = window.setInterval(render, tickMs);
  }

  function start(seconds = configuredSeconds) {
    configuredSeconds = normalizeRestSeconds(seconds, configuredSeconds);
    remainingSeconds = configuredSeconds;
    endsAt = Date.now() + configuredSeconds * 1000;
    paused = false;
    ensureTicker();
    render();
  }

  function pause() {
    if (endsAt === null || paused || remainingSeconds <= 0) return;
    remainingSeconds = remainingRestSeconds(endsAt);
    endsAt = null;
    paused = true;
    clearTicker();
    render();
  }

  function resume() {
    if (!paused || remainingSeconds <= 0) return;
    endsAt = Date.now() + remainingSeconds * 1000;
    paused = false;
    ensureTicker();
    render();
  }

  function reset() {
    clearTicker();
    endsAt = null;
    paused = false;
    remainingSeconds = configuredSeconds;
    render();
  }

  function addSeconds(delta) {
    const adjustment = Math.round(Number(delta));
    if (!Number.isFinite(adjustment)) return;
    if (endsAt !== null && !paused) {
      const next = Math.max(0, remainingRestSeconds(endsAt) + adjustment);
      remainingSeconds = next;
      endsAt = Date.now() + next * 1000;
    } else {
      remainingSeconds = Math.max(0, remainingSeconds + adjustment);
    }
    render();
  }

  function setDefault(seconds, { resetIfIdle = true } = {}) {
    configuredSeconds = normalizeRestSeconds(seconds, configuredSeconds);
    if (resetIfIdle && endsAt === null && !paused) remainingSeconds = configuredSeconds;
    render();
  }

  startButton.addEventListener("click", () => start());
  pauseButton.addEventListener("click", () => paused ? resume() : pause());
  resetButton.addEventListener("click", reset);
  minusButton.addEventListener("click", () => addSeconds(-30));
  plusButton.addEventListener("click", () => addSeconds(30));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) render();
  });

  render();
  return { start, pause, resume, reset, addSeconds, setDefault, render };
}
