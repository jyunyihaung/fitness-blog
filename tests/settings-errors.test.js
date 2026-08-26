import { describe, expect, it, vi } from "vitest";
import { AppError, googleApiError, reportAppError, safeErrorMessage } from "../assets/js/app-error.js";
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

  it("logs only sanitized error metadata", () => {
    const rawCause = { error: { message: "sensitive upstream detail" } };
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    reportAppError("load-dashboard", googleApiError(403, rawCause));
    expect(logger).toHaveBeenCalledWith("Application operation failed.", {
      operation: "load-dashboard",
      code: "permission_denied",
      status: 403,
      retryable: false,
    });
    expect(logger.mock.calls.flat(Infinity)).not.toContain(rawCause);
    logger.mockRestore();
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
