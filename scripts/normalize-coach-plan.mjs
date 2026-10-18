#!/usr/bin/env node
// Local-only import: .xlsx -> typed Block1 rows -> normalized coach plan JSON.
// Never transmits the private source workbook to GitHub Pages or Git.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCoachBlock1 } from "../assets/js/coach-plan-normalize.js";

const script = fileURLToPath(new URL("./coach-xlsx-to-rows.py", import.meta.url));

function usage() {
  process.stderr.write("Usage: node scripts/normalize-coach-plan.mjs <coach.xlsx> [output.json]\n"
    + "Default output: local-coach-plans/normalized-coach-plan.json (Git-ignored).\n");
  process.exitCode = 2;
}

const [, , input, output = "local-coach-plans/normalized-coach-plan.json"] = process.argv;
if (!input || !/\.xlsx$/i.test(input)) {
  usage();
} else {
  const options = { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 };
  // Python is a local development-time tool only; no production runtime dependency.
  const extracted = spawnSync(process.platform === "win32" ? "python" : "python3",
    [script, resolve(input)], options);
  if (extracted.error || extracted.status !== 0) {
    process.stderr.write("Could not extract Block1: "
      + (extracted.stderr || extracted.error?.message || "Python execution failed") + "\n");
    process.exitCode = 1;
  } else {
    try {
      const { sourceSheet, rows } = JSON.parse(extracted.stdout);
      const plan = normalizeCoachBlock1(rows, { sourceSheet });
      const target = resolve(output);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, JSON.stringify(plan, null, 2) + "\n",
        { encoding: "utf8", mode: 0o600 });
      process.stdout.write("Normalized plan saved to " + target + "\n"
        + "Weeks: " + plan.summary.weekCount + "; days/week: " + plan.summary.dayCount
        + "; populated workouts: " + plan.summary.plannedWorkouts
        + "; review items: " + plan.summary.reviewCount + "\n");
      if (plan.summary.reviewCount) {
        process.stdout.write("Review issues in the JSON issues array before using the plan.\n");
      }
    } catch (error) {
      process.stderr.write("Invalid coach-plan data: " + error.message + "\n");
      process.exitCode = 1;
    }
  }
}
