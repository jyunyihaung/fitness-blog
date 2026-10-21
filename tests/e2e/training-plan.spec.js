import { expect, test } from "@playwright/test";
import { HEADERS } from "../../assets/js/google-sheets.js";
import { PLAN_HEADERS } from "../../assets/js/training-plan-model.js";

// Synthetic end-to-end Phase 1+2 exercise. No user workbook or live OAuth
// credentials are accessed. The browser still runs the real page/controllers.
test("Plan manager activates the legacy schema, creates and edits a plan", async ({ page }) => {
  const sheets = new Map(Object.entries(HEADERS).map(([title, headers], id) =>
    [title, { id, rows: [[...headers]] }]));
  sheets.get("Schema").rows.push(
    ["app_id", "powerlifting-training-tracker"], ["schema_version", "1"],
  );
  let nextSheetId = 20;
  const sessionBefore = JSON.stringify(sheets.get("Sessions").rows);
  const setsBefore = JSON.stringify(sheets.get("Sets").rows);

  await page.addInitScript(() => {
    localStorage.setItem("fitnessTracker.spreadsheet", JSON.stringify({
      id: "plan-e2e", name: "Synthetic Training Copy",
    }));
  });
  await page.route("https://accounts.google.com/gsi/client", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: 'window.google = {accounts: {oauth2: {initTokenClient: function(options) {return {requestAccessToken: function() {options.callback({access_token: "e2e-token", expires_in: 3600});}};}}}};',
  }));
  await page.route("https://sheets.googleapis.com/v4/spreadsheets/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const data = req.postDataJSON?.() ?? {};
    const method = req.method();
    const respond = (payload) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify(payload),
    });
    if (method === "GET" && path.endsWith("/plan-e2e")) {
      return respond({
        spreadsheetId: "plan-e2e", properties: { title: "Synthetic Training Copy" },
        sheets: [...sheets].map(([title, value]) => ({ properties: { title, sheetId: value.id } })),
      });
    }
    if (method === "GET" && path.endsWith("/values:batchGet")) {
      return respond({ valueRanges: url.searchParams.getAll("ranges").map((range) => {
        const [title, selected] = range.split("!");
        const rows = sheets.get(title)?.rows ?? [];
        return { values: selected === "1:1" ? rows.slice(0, 1) : rows.map((row) => [...row]) };
      }) });
    }
    if (method === "POST" && path.endsWith("/values:batchUpdate")) {
      for (const entry of data.data ?? []) {
        const title = entry.range.split("!")[0];
        const target = sheets.get(title);
        if (!target) throw new Error("Unknown Google Sheet tab: " + title);
        target.rows[0] ??= [];
        target.rows[0].push(...entry.values[0]);
      }
      return respond({});
    }
    if (method === "POST" && path.endsWith(":batchUpdate")) {
      for (const request of data.requests ?? []) {
        if (request.addSheet) {
          sheets.set(request.addSheet.properties.title, { id: nextSheetId++, rows: [] });
        }
        if (request.appendCells) {
          const sheet = [...sheets.values()].find((value) => value.id === request.appendCells.sheetId);
          for (const row of request.appendCells.rows) {
            sheet.rows.push(row.values.map((cell) => cell.userEnteredValue.stringValue));
          }
        }
        if (request.updateCells) {
          const sheet = [...sheets.values()].find((value) => value.id === request.updateCells.range.sheetId);
          sheet.rows[request.updateCells.range.startRowIndex] =
            request.updateCells.rows[0].values.map((cell) => cell.userEnteredValue.stringValue);
        }
        if (request.deleteDimension) {
          const range = request.deleteDimension.range;
          const sheet = [...sheets.values()].find((value) => value.id === range.sheetId);
          sheet.rows.splice(range.startIndex, range.endIndex - range.startIndex);
        }
      }
      return respond({});
    }
    return route.fulfill({ status: 404, body: "unsupported test request" });
  });

  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("#/dashboard");
  await page.getByRole("button", { name: "重新連線已選擇的檔案" }).click();
  await expect.poll(async () => {
    const ready = await page.locator("html").getAttribute("data-ready");
    return ready === "error"
      ? "error: " + await page.locator("[data-setup-status]").innerText()
      : ready;
  }).toBe("true");
  await page.locator('[data-route-link="/training-plan"]').click();
  await expect(page.locator("[data-plan-connection-help]")).toBeVisible();
  await page.getByRole("link", { name: "前往設定" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "啟用訓練計畫資料表" }).click();
  await expect(page.locator("[data-schema-status]")).toContainText("訓練計畫資料表已啟用");
  expect(sheets.get("TrainingPlans").rows[0]).toEqual(PLAN_HEADERS.TrainingPlans);
  expect(sheets.get("PlannedWorkouts").rows[0]).toEqual(PLAN_HEADERS.PlannedWorkouts);
  expect(sheets.get("PlannedSets").rows[0]).toEqual(PLAN_HEADERS.PlannedSets);

  await page.locator('[data-route-link="/training-plan"]').click();
  await expect(page.locator("[data-plan-status]")).toContainText("已載入 0 份");
  await page.getByRole("button", { name: "建立空白課表" }).click();
  await expect(page.locator("[data-plan-select] option")).toHaveCount(2);
  await expect(page.locator("[data-plan-status]")).toContainText("已建立空白");
  await expect(page.locator("[data-plan-new-item]")).toBeEnabled();
  expect(sheets.get("PlannedWorkouts").rows).toHaveLength(13);

  await page.locator("[data-plan-new-item]").click();
  await page.locator('[data-plan-exercises] [data-exercise-name]').first().fill("Pause Squat");
  await page.locator('[data-plan-exercises] [data-set-weight]').first().fill("50");
  await page.locator('[data-plan-exercises] [data-set-reps]').first().fill("4");
  await page.locator('[data-plan-exercises] [data-plan-load-kind]').first().selectOption("rpe_target");
  await page.locator('[data-plan-exercises] [data-plan-load-rpe]').first().fill("5");
  await page.locator('[data-plan-exercises] [data-add-set]').first().click();
  await expect(page.locator("[data-plan-exercises] [data-set]")).toHaveCount(2);
  await page.locator("[data-plan-new-item]").click();
  await expect(page.locator("[data-plan-exercises] [data-exercise]")).toHaveCount(2);
  await page.locator('[data-plan-exercises] [data-exercise-name]').nth(1).fill("Romanian Deadlift");
  await page.locator('[data-plan-exercises] [data-set-weight]').nth(2).fill("60");
  await page.locator('[data-plan-exercises] [data-set-reps]').nth(2).fill("8");
  await page.locator("[data-plan-save-exercises]").click();
  await expect(page.locator("[data-plan-status]")).toContainText("已儲存 2 個動作、3 組處方");
  await expect(page.locator('[data-plan-exercises] [data-exercise-name]').nth(1)).toHaveValue("Romanian Deadlift");
  await page.getByRole("button", { name: /Week 2/ }).click();
  await expect(page.locator("[data-plan-day-summary]")).toContainText("尚未提供");
  await page.getByRole("button", { name: /Week 1/ }).click();
  await expect(page.locator("[data-plan-exercises] [data-exercise-name]").first()).toHaveValue("Pause Squat");
  expect(sheets.get("PlannedSets").rows).toHaveLength(4);
  const header = sheets.get("PlannedSets").rows[0];
  const getCol = (name) => header.indexOf(name);
  const dataRows = sheets.get("PlannedSets").rows.slice(1);
  expect(dataRows.map((row) => row[getCol("exercise_name")])).toEqual([
    "Pause Squat", "Pause Squat", "Romanian Deadlift",
  ]);
  expect(dataRows.map((row) => row[getCol("load_kind")])).toEqual([
    "rpe_target", "rpe_target", "fixed",
  ]);
  expect(dataRows.map((row) => row[getCol("set_order")])).toEqual(["1", "2", "1"]);
  expect(JSON.stringify(sheets.get("Sessions").rows)).toBe(sessionBefore);
  expect(JSON.stringify(sheets.get("Sets").rows)).toBe(setsBefore);
  expect(errors).toEqual([]);
});
