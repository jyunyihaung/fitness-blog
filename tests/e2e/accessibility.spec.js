import { expect, test } from "@playwright/test";

const routes = ["#/dashboard", "#/record/new", "#/quick-add", "#/records", "#/goals", "#/settings"];

test("primary routes keep one visible h1 and named interactive controls", async ({ page }) => {
  for (const hash of routes) {
    await page.goto(hash);
    await expect(page.locator("[data-route-page]:not([hidden]) h1").first()).toBeVisible();

    const unnamedControls = await page.locator("[data-route-page]:not([hidden]) button, [data-route-page]:not([hidden]) input, [data-route-page]:not([hidden]) select, [data-route-page]:not([hidden]) textarea").evaluateAll((controls) => controls.filter((control) => {
      if (control.hidden || control.disabled || control.type === "hidden") return false;
      const labelledBy = control.getAttribute("aria-labelledby");
      const ariaLabel = control.getAttribute("aria-label");
      const labels = control.labels ? Array.from(control.labels).map((label) => label.textContent?.trim()).filter(Boolean) : [];
      const text = control.textContent?.trim();
      return !labelledBy && !ariaLabel && labels.length === 0 && !text;
    }).map((control) => control.outerHTML));

    expect(unnamedControls, `${hash} should not expose unnamed interactive controls`).toEqual([]);
  }
});

test("hash navigation moves focus to the active route heading", async ({ page }) => {
  await page.goto("#/dashboard");
  await page.goto("#/quick-add");
  await expect(page.locator("#quick-add-title")).toBeFocused();
});
