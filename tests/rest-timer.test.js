import { describe, expect, it } from "vitest";
import { formatRestTime, normalizeRestSeconds, remainingRestSeconds } from "../assets/js/rest-timer.js";
import { ADD_RECORD_REST_SECONDS, QUICK_ADD_REST_SECONDS, WARMUP_REST_SECONDS } from "../assets/js/rest-timer-bootstrap.js";

describe("rest timer calculations", () => {
  it("formats countdown values as mm:ss", () => {
    expect(formatRestTime(0)).toBe("00:00");
    expect(formatRestTime(90)).toBe("01:30");
    expect(formatRestTime(240)).toBe("04:00");
  });

  it("calculates remaining time from an absolute end timestamp", () => {
    expect(remainingRestSeconds(160_000, 100_000)).toBe(60);
    expect(remainingRestSeconds(99_000, 100_000)).toBe(0);
  });

  it("normalizes invalid defaults", () => {
    expect(normalizeRestSeconds("180")).toBe(180);
    expect(normalizeRestSeconds(0, 120)).toBe(120);
    expect(normalizeRestSeconds("bad", 90)).toBe(90);
  });
});

describe("rest timer V1 defaults", () => {
  it("uses a 90 second warm-up rest and 120 second Add Record rest", () => {
    expect(WARMUP_REST_SECONDS).toBe(90);
    expect(ADD_RECORD_REST_SECONDS).toBe(120);
  });

  it("defines a default rest for every Quick Add training mode", () => {
    expect(QUICK_ADD_REST_SECONDS).toEqual({
      strength: 240,
      hypertrophy: 120,
      strengthHypertrophy: 180,
      volume: 120,
      endurance: 60,
      power: 180,
    });
  });
});
