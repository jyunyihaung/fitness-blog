export function readJsonScript(id, fallback = []) {
  const element = document.getElementById(id);

  if (!element) {
    return fallback;
  }

  try {
    return JSON.parse(element.textContent.trim() || "null") ?? fallback;
  } catch (error) {
    console.error(`Unable to parse JSON from #${id}.`, error);
    return fallback;
  }
}

export function getWorkoutData() {
  return readJsonScript("workout-data", []);
}
