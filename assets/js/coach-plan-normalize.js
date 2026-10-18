// Phase 0: normalize coach Block1 worksheet grids without mutating workout records.
// Input is an array of Excel rows. Cells may be primitive values or typed cells
// from scripts/read-coach-xlsx.py ({ raw, kind, numberFormat }).
const DAY_RE = /^Day\s*([1-9]\d*)$/i;
const WEEK_RE = /^Week\s*([1-9]\d*)$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/;
const EMPTY = Object.freeze({ kind: "unspecified" });

function raw(cell) {
  if (cell && typeof cell === "object" && !Array.isArray(cell)) {
    return cell.raw ?? cell.value ?? "";
  }
  return cell ?? "";
}

function text(cell) {
  return String(raw(cell)).trim();
}

function isDateCell(cell) {
  return (cell && typeof cell === "object" && (cell.kind === "date_serial" || cell.kind === "date-formatted"))
    || DATE_RE.test(text(cell));
}

function columnName(index) {
  let name = "";
  for (let i = index + 1; i > 0; i = Math.floor((i - 1) / 26)) {
    name = String.fromCharCode(65 + ((i - 1) % 26)) + name;
  }
  return name;
}

function address(rowIndex, colIndex) {
  return columnName(colIndex) + String(rowIndex + 1);
}

function parseRpe(value) {
  const normalized = text(value).replace(/^RPE\s*/i, "");
  const number = Number(normalized);
  return normalized && Number.isFinite(number) && number >= 1 && number <= 10
    ? number : null;
}

function parseSets(cell, location, issues) {
  const value = text(cell);
  if (!value) return null;
  if (!isDateCell(cell) && /^\d+$/.test(value) && Number(value) > 0) return Number(value);
  issues.push({ code: "invalid_sets", severity: "review", cell: location, raw: value,
    message: "組數不是有效的正整數，請確認原始 Excel。" });
  return null;
}

function parseReps(cell, location, issues) {
  const value = text(cell);
  if (!value) return EMPTY;
  if (isDateCell(cell)) {
    issues.push({ code: "date_formatted_reps", severity: "review", cell: location, raw: value,
      message: "次數儲存成日期格式，不能推測是日期還是 8–12 之類的範圍。" });
    return { kind: "needs_review", raw: value };
  }
  if (/^\d+$/.test(value) && Number(value) > 0) return { kind: "fixed", value: Number(value) };
  const range = value.match(/^(\d+)\s*[-–~～]\s*(\d+)$/);
  if (range && Number(range[1]) > 0 && Number(range[2]) >= Number(range[1])) {
    return { kind: "range", min: Number(range[1]), max: Number(range[2]) };
  }
  const rpe = value.match(/^reps?\s+to\s+rpe\s*(\d+(?:\.\d+)?)$/i);
  if (rpe && parseRpe(rpe[1]) !== null) {
    return { kind: "until_rpe", rpe: Number(rpe[1]) };
  }
  issues.push({ code: "unparsed_reps", severity: "review", cell: location, raw: value,
    message: "無法自動判斷次數，保留原始內容待確認。" });
  return { kind: "needs_review", raw: value };
}

function parseLoad(cell, location, issues) {
  const value = text(cell);
  if (!value) return EMPTY;
  if (isDateCell(cell)) {
    issues.push({ code: "date_formatted_load", severity: "review", cell: location, raw: value,
      message: "重量欄位包含日期格式，請先人工確認真正的處方。" });
    return { kind: "needs_review", raw: value };
  }
  if (/^BW$/i.test(value)) return { kind: "bodyweight" };
  if (/^RPE\s*(\d+(?:\.\d+)?)$/i.test(value) && parseRpe(value) !== null) {
    return { kind: "rpe_target", rpe: parseRpe(value) };
  }
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    return { kind: "fixed", value: Number(value), unit: "kg" };
  }
  const bound = value.match(/^([<>]=?)\s*(\d+(?:\.\d+)?)\s*(kg|lbs?)$/i);
  if (bound) {
    return { kind: "bounded", operator: bound[1], value: Number(bound[2]), unit: bound[3].toLowerCase() };
  }
  issues.push({ code: "unparsed_load", severity: "review", cell: location, raw: value,
    message: "重量無法安全轉換；請核對單位與輸入格式。" });
  return { kind: "needs_review", raw: value };
}

function parseActualWeight(cell, location, issues) {
  const value = text(cell);
  if (!value) return EMPTY;
  if (isDateCell(cell)) {
    issues.push({ code: "date_formatted_actual", severity: "review", cell: location, raw: value,
      message: "執行重量疑似日期格式，需人工確認。" });
    return { kind: "needs_review", raw: value };
  }
  const parts = value.split("/").map((part) => part.trim());
  if (parts.every((part) => /^\d+(?:\.\d+)?$/.test(part))) {
    return { kind: "per_set", valuesKg: parts.map(Number) };
  }
  issues.push({ code: "unparsed_actual", severity: "review", cell: location, raw: value,
    message: "執行重量無法判讀，保留原始文字。" });
  return { kind: "needs_review", raw: value };
}

function parseActualRpe(cell, location, issues) {
  const value = text(cell);
  if (!value) return null;
  if (!isDateCell(cell) && parseRpe(value) !== null) return parseRpe(value);
  issues.push({ code: "unparsed_actual_rpe", severity: "review", cell: location, raw: value,
    message: "實際 RPE 不是 1–10 的有效數字。" });
  return null;
}

function itemKind(name) {
  if (/走路.*步|步數/i.test(name)) return "activity";
  if (/收操|靜態伸展/i.test(name)) return "cooldown";
  if (/暖身|滾筒|球按壓|RPR/i.test(name)) return "warmup";
  return "exercise";
}

function findDayRows(rows) {
  return rows.flatMap((row, rowIndex) => {
    const match = text(row?.[0]).match(DAY_RE);
    return match ? [{ day: Number(match[1]), rowIndex }] : [];
  });
}

function findWeekColumns(rows) {
  const matches = (rows[0] ?? []).flatMap((cell, colIndex) => {
    const match = text(cell).match(WEEK_RE);
    return match ? [{ week: Number(match[1]), colIndex }] : [];
  });
  if (matches.length === 0) throw new Error("Block1 缺少 Week1、Week2 等週次標題。");
  const unique = new Set();
  for (const { week } of matches) {
    if (unique.has(week)) throw new Error("Block1 包含重複的 Week" + week + " 標題。");
    unique.add(week);
  }
  return matches;
}

function walkTarget(name, cell) {
  const match = text(cell).match(/^(\d+)\+?$/);
  const nameMatch = name.match(/走路\s*(\d+)\s*步/);
  const value = match ? Number(match[1]) : nameMatch ? Number(nameMatch[1]) : null;
  return value === null ? null : { metric: "steps", minimum: value };
}

export function normalizeCoachBlock1(rows, { sourceSheet = "Block1" } = {}) {
  if (!Array.isArray(rows) || rows.length === 0 || !rows.every(Array.isArray)) {
    throw new Error("請提供 Excel Block1 工作表的二維列資料。");
  }
  const days = findDayRows(rows);
  if (!days.length) throw new Error("Block1 缺少 Day1、Day2 等訓練日標題。");
  const weeks = findWeekColumns(rows);
  const issues = [];

  const normalizedWeeks = weeks.map(({ week, colIndex }) => {
    const notes = new Set();
    const workouts = days.map(({ day, rowIndex }, dayIndex) => {
      const endIndex = days[dayIndex + 1]?.rowIndex ?? rows.length;
      const items = [];
      for (let r = rowIndex + 1; r < endIndex; r += 1) {
        const row = rows[r] ?? [];
        const name = text(row[0]);
        if (!name || DAY_RE.test(name) || WEEK_RE.test(name) || /^Day\d+跟Day\d+/i.test(name)) {
          if (/^Day\d+跟Day\d+/.test(name)) notes.add(name);
          const extra = text(row[colIndex]);
          if (/休息日/.test(extra)) notes.add(extra);
          continue;
        }
        const entries = Array.from({ length: 8 }, (_, offset) => row[colIndex + offset]);
        const [setsCell, repsCell, loadCell, actualWeightCell, firstRpeCell, lastRpeCell, recordCell, noteCell] = entries;
        if (entries.every((entry) => !text(entry))) continue;

        // Rest-day prescriptions appear in the same row as separators, not workouts.
        if (/休息日/.test(text(setsCell))) {
          notes.add(text(setsCell));
          continue;
        }
        const kind = itemKind(name);
        const start = address(r, colIndex);
        const prescription = {
          sets: kind === "activity" ? null : parseSets(setsCell, start, issues),
          reps: kind === "activity" ? EMPTY : parseReps(repsCell, address(r, colIndex + 1), issues),
          load: kind === "activity" ? EMPTY : parseLoad(loadCell, address(r, colIndex + 2), issues),
        };
        if (kind === "activity") {
          prescription.target = walkTarget(name, setsCell);
          if (!prescription.target) {
            issues.push({ code: "invalid_activity_target", severity: "review", cell: start,
              raw: text(setsCell), message: "活動目標需確認。" });
          }
        }
        items.push({
          name,
          kind,
          planned: prescription,
          actual: {
            load: parseActualWeight(actualWeightCell, address(r, colIndex + 3), issues),
            firstRpe: parseActualRpe(firstRpeCell, address(r, colIndex + 4), issues),
            lastRpe: parseActualRpe(lastRpeCell, address(r, colIndex + 5), issues),
            record: text(recordCell),
          },
          coachNotes: text(noteCell),
          source: { sheet: sourceSheet, row: r + 1, week, day },
        });
      }
      return { day, status: items.length ? "planned" : "not_provided", items };
    });
    return {
      week,
      status: workouts.some((workout) => workout.items.length) ? "planned" : "not_provided",
      workouts,
      notes: Array.from(notes),
    };
  });
  return {
    format: "fitness-blog-coach-plan",
    version: 1,
    source: { sheet: sourceSheet, importedAt: new Date().toISOString() },
    blocks: [{ name: sourceSheet, weeks: normalizedWeeks }],
    issues,
    summary: {
      weekCount: normalizedWeeks.length,
      dayCount: days.length,
      plannedWorkouts: normalizedWeeks.reduce((total, week) =>
        total + week.workouts.filter((workout) => workout.status === "planned").length, 0),
      reviewCount: issues.filter((issue) => issue.severity === "review").length,
    },
  };
}
