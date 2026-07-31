const { test, expect } = require("@playwright/test");

/**
 * ENV-GATED live-stack specs.
 * Set BETTERMTA_E2E_LIVE_BASE to the running web origin.
 * Skips cleanly when unset — do not run against real stack in default CI.
 */
const LIVE_BASE = process.env.BETTERMTA_E2E_LIVE_BASE;

test.describe("live-stack @live-stack", () => {
  test.skip(
    !LIVE_BASE,
    "BETTERMTA_E2E_LIVE_BASE unset — skipping real-stack e2e",
  );

  test.use({
    baseURL: LIVE_BASE || "http://127.0.0.1:3000",
  });

  test("station search against real stack", async ({ page }) => {
    await page.goto("/");
    const from = page.getByPlaceholder(/Starting station/i);
    await from.fill("");
    await from.pressSequentially("Union", { delay: 40 });
    await expect(
      page.getByRole("listbox", { name: /Origin suggestions/i }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("option").first().click();
  });

  test("baseline search against real stack", async ({ page }) => {
    await page.goto("/");
    const from = page.getByPlaceholder(/Starting station/i);
    await from.pressSequentially("Carroll", { delay: 40 });
    await page.getByRole("listbox", { name: /Origin suggestions/i }).waitFor();
    await page.getByRole("option").first().click();

    const to = page.getByPlaceholder(/Destination station/i);
    await to.pressSequentially("Bryant", { delay: 40 });
    await page
      .getByRole("listbox", { name: /Destination suggestions/i })
      .waitFor();
    await page.getByRole("option").first().click();

    await page.getByTestId("find-routes").click();
    await expect(
      page
        .getByTestId("results-list")
        .or(page.getByTestId("no-route-state"))
        .or(page.getByTestId("empty-state"))
        .or(page.getByTestId("error-state"))
        .or(page.getByTestId("unavailable-state")),
    ).toBeVisible({ timeout: 30_000 });
  });
});
