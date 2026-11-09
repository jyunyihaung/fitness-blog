import { expect, test } from "@playwright/test";
import { HEADERS } from "../../assets/js/google-sheets.js";
import { PLAN_HEADERS } from "../../assets/js/training-plan-model.js";

// Synthetic end-to-end Phase 1+2 exercise. No user workbook or live OAuth
// credentials are accessed. The browser still runs the real page/controllers.
for (const recovery of [false, true]) {
test("Plan manager activates the legacy schema, creates and edits a plan" + (recovery ? " with save recovery" : ""), async ({ page }) => {
  test.setTimeout(60_000);
  let failureMode = "";
  const sheets = new Map(Object.entries(HEADERS).map(([title, headers], id) =>
    [title, { id, rows: [[...headers]] }]));
  sheets.get("Schema").rows.push(
    ["app_id", "powerlifting-training-tracker"], ["schema_version", "1"],
  );
  let nextSheetId = 20;
  const sessionBefore = JSON.stringify(sheets.get("Sessions").rows.slice(1));
  const setsBefore = JSON.stringify(sheets.get("Sets").rows.slice(1));

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
      if (failureMode === "auth") {
        failureMode = "";
        return route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
      }
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
      const linkedSave = data.requests?.some(r => r.appendCells?.sheetId === sheets.get("Sessions").id);
      if (linkedSave && failureMode === "network") {
        failureMode = "";
        return route.abort("failed");
      }
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
      if (linkedSave && failureMode === "lost-response") {
        failureMode = "";
        return route.abort("failed");
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
  await page.locator('[data-plan-exercises] [data-set-notes]').first().fill("第1組：下放控制\n保持核心張力 <穩定>");
  await page.locator('[data-plan-exercises] [data-set-notes]').nth(1).fill("第2組：離心速度放慢");
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
  expect(JSON.stringify(sheets.get("Sessions").rows.slice(1))).toBe(sessionBefore);
  expect(JSON.stringify(sheets.get("Sets").rows.slice(1))).toBe(setsBefore);

  await expect(page.locator("[data-plan-start-workout]")).toBeEnabled();
  await page.locator("[data-plan-start-workout]").click();
  await expect(page.locator("[data-plan-runner]")).toBeVisible();
  await expect(page.locator("[data-plan-run-exercises] [data-set]")).toHaveCount(3);
  await expect(page.locator("[data-plan-run-exercises] .plan-execution-target").first())
    .toContainText("RPE 5");
  // The original plan's Record field is displayed under each prescribed
  // target, but never becomes an actual-set note automatically.
  const firstSet = page.locator("[data-plan-run-exercises] [data-set]").first();
  const secondSet = page.locator("[data-plan-run-exercises] [data-set]").nth(1);
  await expect(firstSet.locator(".plan-execution-record")).toContainText(
    "課表紀錄：第1組：下放控制");
  await expect(firstSet.locator(".plan-execution-record")).toContainText(
    "保持核心張力 <穩定>");
  await expect(secondSet.locator(".plan-execution-record")).toHaveText(
    "課表紀錄：第2組：離心速度放慢");
  await expect(page.locator("[data-plan-run-exercises] .plan-execution-record")).toHaveCount(2);
  await expect(firstSet.locator("[data-set-notes]")).toHaveValue("");
  await expect(secondSet.locator("[data-set-notes]")).toHaveValue("");
  await expect(firstSet.locator(".plan-execution-record strong")).toHaveCount(0);
  await page.locator('[data-plan-run-exercises] [data-set-weight]').first().fill("60");
  await page.locator('[data-plan-run-exercises] [data-set-reps]').first().fill("4");
  await page.locator('[data-plan-run-exercises] [data-set-rpe]').first().fill("6");
  await page.locator('[data-plan-run-exercises] [data-set-completed]').first().check();
  await expect(page.locator('[data-plan-run-exercises] [data-set]').first()
    .locator("[data-inline-rest]")).toHaveAttribute("data-rest-state", "running");
  // Adding after a completed set must not clone performance/completion.
  await secondSet.locator("[data-set-weight]").fill("60");
  await secondSet.locator("[data-set-rpe]").fill("7");
  await secondSet.locator("[data-set-completed]").check();
  await page.locator('[data-plan-run-exercises] [data-add-set]').first().click();
  const extraSet = page.locator('[data-plan-run-exercises] [data-exercise]').first()
    .locator('[data-set]').last();
  await expect(extraSet.locator('[data-set-completed]')).not.toBeChecked();
  await expect(extraSet.locator('[data-set-rpe]')).toHaveValue("");
  await expect(extraSet).toHaveAttribute('data-planned-set-id', '');
  await secondSet.locator('[data-set-completed]').uncheck();
  if (recovery) {
    // Ordinary navigation preserves DOM draft, completion and notes.
    await page.locator('[data-route-link="/dashboard"]').click();
    await page.locator('[data-route-link="/training-plan"]').click();
    await expect(firstSet.locator('[data-set-weight]')).toHaveValue('60');
    await expect(firstSet.locator('[data-set-completed]')).toBeChecked();
    // A different workbook must never receive this draft.
    await page.evaluate(async () => {
      const { appState } = await import('./assets/js/app-state.js');
      appState.set('selectedSpreadsheet', { id: 'other-test-copy' });
    });
    await page.locator('[data-plan-run-save]').click();
    await expect(page.locator('[data-plan-run-status]')).toContainText('已切換');
    expect(sheets.get('Sessions').rows).toHaveLength(1);
    await page.evaluate(async () => {
      const { appState } = await import('./assets/js/app-state.js');
      appState.set('selectedSpreadsheet', { id: 'plan-e2e', name: 'Synthetic Training Copy' });
    });
    failureMode = 'auth';
    await page.locator('[data-plan-run-save]').click();
    await expect(page.locator('[data-plan-run-reconnect]')).toBeVisible();
    await expect(firstSet.locator('[data-set-weight]')).toBeDisabled();
    await page.locator('[data-plan-run-reconnect]').click();
    await expect(page.locator('[data-plan-run-status]')).toContainText('已重新連線');
    // Repair the optional columns via the real Settings workflow, then return.
    sheets.get('Sets').rows[0].splice(sheets.get('Sets').rows[0].indexOf('planned_set_id'), 1);
    await page.locator('[data-plan-run-save]').click();
    await expect(page.locator('[data-plan-run-status]')).toContainText('關聯欄位');
    await page.locator('[data-plan-run-help]').click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '啟用訓練計畫資料表' }).click();
    await expect(page.locator('[data-schema-status]')).toContainText('訓練計畫資料表已啟用');
    await page.locator('[data-route-link="/training-plan"]').click();
    await expect(firstSet.locator('[data-set-weight]')).toHaveValue('60');
    await expect(firstSet.locator('[data-set-weight]')).toBeDisabled();
    failureMode = 'network';
    await page.locator('[data-plan-run-save]').click();
    await expect(page.locator('[data-plan-run-status]')).toContainText('無法確認');
    expect(sheets.get('Sessions').rows).toHaveLength(1);
    failureMode = 'lost-response';
    await page.locator('[data-plan-run-save]').click();
    await expect(page.locator('[data-plan-run-status]')).toContainText('無法確認');
    expect(sheets.get('Sessions').rows).toHaveLength(2);
    const table = sheets.get('Sets');
    const weightCol = table.rows[0].indexOf('weight_kg');
    table.rows[1][weightCol] = '70';
    await page.locator('[data-plan-run-save]').click();
    await expect(page.locator('[data-plan-run-status]')).toContainText('本次不同');
    await expect(page.locator('[data-plan-run-review]')).toBeVisible();
    expect(sheets.get('Sessions').rows).toHaveLength(2);
    table.rows[1][weightCol] = '60';
  }
  await page.locator("[data-plan-run-save]").click();
  await expect(page).toHaveURL(/records$/);
  await expect(page.locator("[data-records-output] .record-session-title")).toContainText("Week 1 · Day 1");
  await expect(page.locator("[data-records-output]")).toContainText("Pause Squat");
  await expect(page.locator("[data-records-output]")).toContainText("60 kg");
  await expect(page.locator("[data-records-status]")).toBeHidden();
  expect(sheets.get("Sessions").rows).toHaveLength(2);
  expect(sheets.get("Sets").rows).toHaveLength(2);
  const sessionColumns = sheets.get("Sessions").rows[0];
  const session = sheets.get("Sessions").rows[1];
  expect(session[sessionColumns.indexOf("plan_id")]).toBe(
    sheets.get("TrainingPlans").rows[1][0]);
  expect(session[sessionColumns.indexOf("planned_workout_id")]).toBe(
    sheets.get("PlannedWorkouts").rows[1][0]);
  const actualColumns = sheets.get("Sets").rows[0];
  const actual = sheets.get("Sets").rows[1];
  expect(actual[actualColumns.indexOf("planned_set_id")]).toBe(
    sheets.get("PlannedSets").rows[1][0]);
  expect(actual[actualColumns.indexOf("weight_kg")]).toBe("60");
  expect(actual[actualColumns.indexOf("rpe")]).toBe("6");
  expect(actual[actualColumns.indexOf("notes")]).toBe("");
  // Exercise identity survives the complete list -> editor -> Sheets path.
  const originalSetId = actual[actualColumns.indexOf("set_id")];
  const originalPlanSetId = actual[actualColumns.indexOf("planned_set_id")];
  const originalCreatedAt = actual[actualColumns.indexOf("created_at")];
  await page.locator('[data-records-output]').getByRole('button', { name: '編輯', exact: true }).click();
  const editExercise = page.locator('[data-exercises] [data-exercise]').first();
  await editExercise.locator('[data-exercise-name]').fill('Renamed Pause Squat');
  await editExercise.locator('[data-set-weight]').first().fill('65');
  await editExercise.locator('[data-add-set]').click();
  await expect(editExercise.locator('[data-set-rpe]').last()).toHaveValue('');
  await editExercise.locator('[data-set-weight]').last().fill('55');
  await page.locator('[data-save-record]').click();
  await expect(page).toHaveURL(/records$/);
  await expect(page.locator('[data-records-output]')).toContainText('Renamed Pause Squat');
  await expect(page.locator('[data-records-output]')).toContainText('65 kg');
  await expect(page.locator('[data-records-output]')).toContainText('55 kg');
  expect(sheets.get('Sessions').rows).toHaveLength(2);
  expect(sheets.get('Sets').rows).toHaveLength(3);
  const editedRows = sheets.get('Sets').rows.slice(1);
  expect(editedRows[0][actualColumns.indexOf('set_id')]).toBe(originalSetId);
  expect(editedRows[0][actualColumns.indexOf('planned_set_id')]).toBe(originalPlanSetId);
  expect(editedRows[0][actualColumns.indexOf('created_at')]).toBe(originalCreatedAt);
  expect(editedRows[1][actualColumns.indexOf('set_id')]).not.toBe(originalSetId);
  expect(editedRows[1][actualColumns.indexOf('planned_set_id')]).toBe('');
  // Removing the original group member does not transfer its link to the extra.
  const extraId = editedRows[1][actualColumns.indexOf('set_id')];
  await page.locator('[data-records-output]').getByRole('button', { name: '編輯', exact: true }).click();
  await page.locator('[data-exercises] [data-remove-set]').first().click();
  await page.locator('[data-save-record]').click();
  await expect(page).toHaveURL(/records$/);
  await expect(page.locator('[data-records-output]')).toContainText('55 kg');
  await expect(page.locator('[data-records-output]')).not.toContainText('65 kg');
  expect(sheets.get('Sets').rows).toHaveLength(2);
  expect(sheets.get('Sets').rows[1][actualColumns.indexOf('set_id')]).toBe(extraId);
  expect(sheets.get('Sets').rows[1][actualColumns.indexOf('planned_set_id')]).toBe('');
  expect(errors).toEqual([]);
});

}
