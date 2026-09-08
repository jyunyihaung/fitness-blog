import { expect, test } from "@playwright/test";

test("Quick Add generates an editable warm-up + working-set workout from manual 1RM", async ({ page }) => {
  await page.goto("#/quick-add");

  await page.getByRole("button", { name: /Squat/ }).click();
  await page.getByLabel("手動輸入最大重量").check();
  await page.getByLabel("手動參考 1RM（kg）").fill("100");
  await page.locator('[data-choice-group="mode"][data-choice-id="strength"]').click();

  await expect(page.getByText("Strength / 最大肌力")).toBeVisible();
  await page.getByRole("button", { name: "產生訓練建議" }).click();

  await expect(page.locator("[data-workout-preview]")).toBeVisible();
  await expect(page.locator("[data-preview-reference]")).toHaveText("100 kg");
  await expect(page.locator("[data-preview-workout]")).toContainText("85 kg × 3 reps × 4 sets");
  await expect(page.locator("[data-preview-warmup]")).not.toHaveText("未加入");
  await expect(page.locator("[data-quick-exercises]")).toBeVisible();
  await expect(page.locator("[data-save-quick-workout]")).toBeVisible();
});

test("Quick Add can generate without warm-up sets", async ({ page }) => {
  await page.goto("#/quick-add");

  await page.getByRole("button", { name: /Bench Press/ }).click();
  await page.getByLabel("手動輸入最大重量").check();
  await page.getByLabel("手動參考 1RM（kg）").fill("70");
  await page.locator('[data-choice-group="mode"][data-choice-id="hypertrophy"]').click();
  await page.getByLabel("自動加入暖身組").uncheck();
  await page.getByRole("button", { name: "產生訓練建議" }).click();

  await expect(page.locator("[data-preview-reference]")).toHaveText("70 kg");
  await expect(page.locator("[data-preview-workout]")).toContainText("49 kg × 8 reps × 4 sets");
  await expect(page.locator("[data-preview-warmup]")).toHaveText("未加入");
});
