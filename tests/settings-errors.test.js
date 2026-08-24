import { describe, expect, it } from "vitest";
import { AppError, googleApiError, safeErrorMessage } from "../assets/js/app-error.js";
import { createSettingRecords, parseSettings, validateSettings } from "../assets/js/settings.js";

describe("safe application errors", () => {
  it("does not expose a raw Google API response", () => {
    const error = googleApiError(500, { error: { message: "sensitive upstream detail" } });
    expect(error).toBeInstanceOf(AppError);
    expect(safeErrorMessage(error)).not.toContain("sensitive upstream detail");
    expect(error.retryable).toBe(true);
  });

  it("maps authorization cancellation to a stable message", () => {
    expect(safeErrorMessage(new DOMException("raw", "AbortError"))).toContain("取消");
  });
});

describe("settings domain", () => {
  it("parses settings by header and applies defaults", () => {
    const settings = parseSettings([
      ["value", "updated_at", "key"],
      ["dark", "now", "theme"],
    ]);
    expect(settings.theme).toBe("dark");
    expect(settings.locale).toBe("zh-TW");
  });

  it("validates and converts supported preferences", () => {
    const settings = { weight_unit: "kg", locale: "zh-TW", theme: "system", default_rpe_enabled: "true" };
    expect(validateSettings(settings)).toEqual([]);
    expect(createSettingRecords(settings)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "default_rpe_enabled", value: "true" }),
    ]));
  });
});
