const SPREADSHEET_KEY = "fitnessTracker.spreadsheet";

export function getSelectedSpreadsheet() {
  try {
    return JSON.parse(localStorage.getItem(SPREADSHEET_KEY)) ?? null;
  } catch (_) {
    return null;
  }
}

export function saveSelectedSpreadsheet(spreadsheet) {
  localStorage.setItem(SPREADSHEET_KEY, JSON.stringify({ id: spreadsheet.id, name: spreadsheet.name }));
}

export function clearSelectedSpreadsheet() {
  localStorage.removeItem(SPREADSHEET_KEY);
}
