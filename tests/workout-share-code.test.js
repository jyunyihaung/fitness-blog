import { describe, expect, it } from "vitest";
import {
  createWorkoutTemplate,
  decodeWorkoutShareCode,
  encodeWorkoutShareCode,
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
  it("round-trips Chinese workout content", async () => {
    const code = await encodeWorkoutShareCode(createWorkoutTemplate(workout, { displayName: "王教練" }));
    const result = await decodeWorkoutShareCode(code);
    expect(result.draft).toEqual(expect.objectContaining({ title: "深蹲強度日", notes: workout.notes }));
    expect(result.summary).toEqual(expect.objectContaining({ displayName: "王教練", exerciseCount: 1, setCount: 1 }));
  });

  it("extracts a share code from surrounding chat text and whitespace", async () => {
    const code = await encodeWorkoutShareCode(createWorkoutTemplate(workout));
    const [prefix, payload, checksum, end] = code.split("\n");
    const wrappedPayload = payload.match(/.{1,30}/g).join("\n");
    const wrapped = `明天請完成這份菜單：\n\n${prefix}\n${wrappedPayload}\n${checksum}\n${end}\n做完告訴我。`;
    expect((await decodeWorkoutShareCode(wrapped)).draft.title).toBe("深蹲強度日");
  });

  it("rejects modified payloads using the checksum", async () => {
    const code = await encodeWorkoutShareCode(createWorkoutTemplate(workout));
    const modified = code.replace(/\n([A-Za-z0-9_-])/, (_, character) => `\n${character === "A" ? "B" : "A"}`);
    await expect(decodeWorkoutShareCode(modified)).rejects.toMatchObject({ code: "checksum_mismatch" });
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
