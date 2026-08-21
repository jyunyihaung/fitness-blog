import { getSelectedSpreadsheet, saveSelectedSpreadsheet } from "./preferences.js";

const state = {
  selectedSpreadsheet: getSelectedSpreadsheet(),
  workouts: [],
  goals: [],
  statistics: null,
  recordDraft: null,
};

export const appState = {
  get(key) {
    return state[key];
  },
  set(key, value) {
    state[key] = value;
    window.dispatchEvent(new CustomEvent("fitness:state-change", { detail: { key, value } }));
  },
  setSelectedSpreadsheet(spreadsheet) {
    saveSelectedSpreadsheet(spreadsheet);
    this.set("selectedSpreadsheet", spreadsheet);
  },
};
