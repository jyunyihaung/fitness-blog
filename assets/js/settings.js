export const DEFAULT_SETTINGS = {
  weight_unit: "kg",
  locale: "zh-TW",
  theme: "system",
  default_rpe_enabled: "false",
};

export function parseSettings(rows) {
  const [headers = [], ...values] = rows ?? [];
  const normalizedHeaders = headers.map((header) => String(header).trim());
  const required = ["key", "value", "updated_at"];
  if (required.some((header) => !normalizedHeaders.includes(header))) throw new Error("Settings schema is invalid.");
  const settings = { ...DEFAULT_SETTINGS };
  values.forEach((row) => {
    const record = Object.fromEntries(normalizedHeaders.map((header, index) => [header, String(row[index] ?? "").trim()]));
    if (Object.hasOwn(DEFAULT_SETTINGS, record.key)) settings[record.key] = record.value;
  });
  return settings;
}

export function validateSettings(settings) {
  const errors = [];
  if (settings.weight_unit !== "kg") errors.push("目前僅支援公斤（kg）。");
  if (!["zh-TW", "en"].includes(settings.locale)) errors.push("請選擇有效的介面語言。");
  if (!["system", "light", "dark"].includes(settings.theme)) errors.push("請選擇有效的主題。");
  if (!["true", "false"].includes(settings.default_rpe_enabled)) errors.push("預設 RPE 設定無效。");
  return errors;
}

export function createSettingRecords(settings) {
  const now = new Date().toISOString();
  return Object.entries(settings).map(([key, value]) => ({ key, value: String(value), updated_at: now }));
}
