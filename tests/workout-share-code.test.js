import { describe, expect, it } from "vitest";
import {
  createWorkoutTemplate,
  decodeWorkoutShareCode,
  encodeWorkoutShareCode,
  getWorkoutShareCodeDiagnostics,
  WorkoutShareCodeError,
} from "../assets/js/workout-share-code.js";

const workout = {
  trainingDate: "2026-08-25",
  title: "深蹲強度日",
  durationMinutes: "90",
  notes: "主項超過 RPE 8 時降重 5%。",
  exercises: [{
    name: "Squat",
    category: "squat",
    sets: [{ weightKg: "100", reps: "5", rpe: "7", type: "working", isWarmup: false, notes: "休息 3 分鐘" }],
  }],
};

describe("workout share codes", () => {
  it("round-trips Chinese workout content without exporting notes", async () => {
    const template = createWorkoutTemplate(workout, { displayName: "王教練" });
    const code = await encodeWorkoutShareCode(template);
    expect(code).toMatch(/^FITNESS-WORKOUT:1:[A-Za-z0-9_-]+:CHECKSUM:[a-f0-9]{16}:END$/);
    expect(code).not.toContain("\n");
    expect(template.workout).not.toHaveProperty("notes");
    expect(template.workout.exercises[0].sets[0]).not.toHaveProperty("notes");
    const result = await decodeWorkoutShareCode(code);
    expect(result.draft).toEqual(expect.objectContaining({ title: "深蹲強度日", notes: "" }));
    expect(result.draft.exercises[0].sets[0].notes).toBe("");
    expect(result.summary).toEqual(expect.objectContaining({ displayName: "王教練", exerciseCount: 1, setCount: 1 }));
  });

  it("exports workout and set notes when explicitly requested", async () => {
    const template = createWorkoutTemplate(workout, { includeNotes: true });
    expect(template.workout.notes).toBe(workout.notes);
    expect(template.workout.exercises[0].sets[0].notes).toBe("休息 3 分鐘");
    const result = await decodeWorkoutShareCode(await encodeWorkoutShareCode(template));
    expect(result.draft.notes).toBe(workout.notes);
    expect(result.draft.exercises[0].sets[0].notes).toBe("休息 3 分鐘");
  });

  it("extracts a share code from surrounding chat text and whitespace", async () => {
    const code = await encodeWorkoutShareCode(createWorkoutTemplate(workout));
    const [, payload, checksum] = code.match(/^FITNESS-WORKOUT:1:([^:]+):CHECKSUM:([a-f0-9]{16}):END$/);
    const wrappedPayload = payload.match(/.{1,30}/g).join("\n");
    const wrapped = `明天請完成這份菜單：\n\nFITNESS-WORKOUT:1\n${wrappedPayload}\n:CHECKSUM:${checksum}\n:END\n做完告訴我。`;
    expect((await decodeWorkoutShareCode(wrapped)).draft.title).toBe("深蹲強度日");
  });

  it("ignores invisible whitespace inserted during copying", async () => {
    const code = await encodeWorkoutShareCode(createWorkoutTemplate(workout));
    const [, payload, checksum] = code.match(/^FITNESS-WORKOUT:1:([^:]+):CHECKSUM:([a-f0-9]{16}):END$/);
    const transportedPayload = payload.match(/.{1,25}/g).join("\u200B \uFEFF");
    const transported = `FITNESS-WORKOUT:1\u200B${transportedPayload}\u2060:CHECKSUM:${checksum}\u200D:END`;
    expect((await decodeWorkoutShareCode(transported)).draft.title).toBe("深蹲強度日");
  });

  it("decodes a URL-encoded legacy code pasted from mobile Safari", async () => {
    const code = await encodeWorkoutShareCode(createWorkoutTemplate(workout));
    const [, payload, checksum] = code.match(/^FITNESS-WORKOUT:1:([^:]+):CHECKSUM:([a-f0-9]{16}):END$/);
    const legacyCode = `FITNESS-WORKOUT:1\n${payload}\n:CHECKSUM:${checksum}\n:END`;
    const transported = encodeURIComponent(legacyCode);
    expect(transported).toContain("%0A%3ACHECKSUM%3A");
    expect((await decodeWorkoutShareCode(transported)).draft.title).toBe("深蹲強度日");
    expect(getWorkoutShareCodeDiagnostics(transported)).toContain("URL 編碼：是，已還原");
  });

  it("accepts format markers lowercased by an iPhone paste", async () => {
    const code = await encodeWorkoutShareCode(createWorkoutTemplate(workout));
    const transported = code
      .replace("FITNESS-WORKOUT", "fitness-workout")
      .replace(":CHECKSUM:", ":checksum:")
      .replace(":END", ":end");
    expect((await decodeWorkoutShareCode(transported)).draft.title).toBe("深蹲強度日");
    expect(getWorkoutShareCodeDiagnostics(transported)).toContain("找到，但大小寫已改變");
  });

  it("reports missing share-code sections without echoing the complete input", () => {
    const diagnostics = getWorkoutShareCodeDiagnostics("FITNESS-WORKOUT：1：payload");
    expect(diagnostics).toContain("前綴 FITNESS-WORKOUT:1：找不到");
    expect(diagnostics).toContain("U+FF1A");
    expect(diagnostics).toContain("CHECKSUM 標記：找不到");
  });

  it("rejects modified payloads using the checksum", async () => {
    const code = await encodeWorkoutShareCode(createWorkoutTemplate(workout));
    const modified = code.replace(/^(FITNESS-WORKOUT:1:)([A-Za-z0-9_-])/, (_, prefix, character) => `${prefix}${character === "A" ? "B" : "A"}`);
    await expect(decodeWorkoutShareCode(modified)).rejects.toMatchObject({ code: "checksum_mismatch" });
  });

  it("reports text corrupted by character replacement", async () => {
    const code = await encodeWorkoutShareCode(createWorkoutTemplate(workout));
    const corrupted = code.replace(/^(FITNESS-WORKOUT:1:.{10})/, "$1\uFFFD");
    await expect(decodeWorkoutShareCode(corrupted)).rejects.toMatchObject({ code: "corrupted_text" });
  });

  it("rejects multiple codes in one pasted message", async () => {
    const code = await encodeWorkoutShareCode(createWorkoutTemplate(workout));
    await expect(decodeWorkoutShareCode(`${code}\n${code}`)).rejects.toMatchObject({ code: "multiple_codes" });
  });

  it("does not export internal IDs or connection credentials", async () => {
    const template = createWorkoutTemplate({ ...workout, sessionId: "secret-session", spreadsheetId: "secret-sheet" });
    const code = await encodeWorkoutShareCode(template);
    expect(code).not.toContain("secret-session");
    expect(code).not.toContain("secret-sheet");
    expect(template.workout).not.toHaveProperty("mode");
    expect(WorkoutShareCodeError).toBeTypeOf("function");
  });
});
