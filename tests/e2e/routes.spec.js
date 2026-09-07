import { expect, test } from "@playwright/test";

const routes = [
  ["dashboard", "#/dashboard", "Fitness Blog"],
  ["add record", "#/record/new", "新增訓練紀錄"],
  ["quick add", "#/quick-add", "快速新增紀錄"],
  ["records", "#/records", "訓練紀錄"],
  ["goals", "#/goals", "訓練目標"],
  ["settings", "#/settings", "設定"],
];

for (const [name, hash, heading] of routes) {
  test(`${name} route renders without a browser crash`, async ({ page }) => {
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));

    await page.goto(hash);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    expect(browserErrors).toEqual([]);
  });
}

test("mobile routes do not introduce horizontal page overflow", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile-only release check");

  for (const [, hash] of routes) {
    await page.goto(hash);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${hash} should fit inside the mobile viewport`).toBeLessThanOrEqual(1);
  }
});
