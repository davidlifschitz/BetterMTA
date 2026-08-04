const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const { installApiMocks, pickStation } = require("./helpers/api-mocks.cjs");
const { loadFixture } = require("./helpers/schema.cjs");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

function withRequestId(fixture, id) {
  return { ...fixture, requestId: id };
}

test.describe("BetterMTA live frontend (mocked API)", () => {
  test("station search autocomplete + selection", async ({ page }) => {
    await installApiMocks(page);
    await page.goto("/");
    await pickStation(page, "from", "Car", /Carroll St/i);
    await expect(page.getByPlaceholder(/Starting station/i)).toHaveValue(
      "Carroll St",
    );
    await pickStation(page, "to", "Bry", /Bryant Park/i);
    await expect(page.getByPlaceholder(/Destination station/i)).toHaveValue(
      "Bryant Park",
    );
    await expect(page.getByTestId("fixture-hint")).toHaveCount(0);
  });

  test("current location grant => coordinate origin; deny => honest message", async ({
    page,
    context,
  }) => {
    await installApiMocks(page);
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 40.679, longitude: -73.995 });
    await page.goto("/");
    await page.getByTestId("use-my-location").click();
    await expect(page.getByPlaceholder(/Starting station/i)).toHaveValue(
      "Current location",
    );
    await expect(page.getByTestId("location-status")).toContainText(
      /current coordinates/i,
    );

    const denyContext = await page.context().browser().newContext({
      permissions: [],
    });
    const denyPage = await denyContext.newPage();
    await installApiMocks(denyPage);
    await denyPage.addInitScript(() => {
      const err = {
        code: 1,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: "denied",
      };
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition(_s, error) {
            error?.(err);
          },
        },
      });
    });
    await denyPage.goto("/");
    await denyPage.getByTestId("use-my-location").click();
    await expect(denyPage.getByTestId("location-status")).toContainText(
      /permission denied/i,
    );
    await denyContext.close();
  });

  test("baseline search (no lines) renders server-ordered results", async ({
    page,
  }) => {
    const baseline = withRequestId(
      loadFixture("routes/baseline-only.json"),
      "req_e2e_baseline",
    );
    await installApiMocks(page, {
      search: () => baseline,
    });
    await page.goto("/");
    await pickStation(page, "from", "Car", /Carroll St/i);
    await pickStation(page, "to", "Bry", /Bryant Park/i);
    await page.getByTestId("find-routes").click();
    await expect(page.getByTestId("results-list")).toBeVisible();
    await expect(page.getByText(/Suggested routes/i)).toBeVisible();
    const cards = page.getByTestId("route-card");
    await expect(cards).toHaveCount(baseline.baseline.itineraries.length);
    await expect(page.getByTestId("search-feedback")).toHaveCount(0);
  });

  test("one selected line complete satisfaction", async ({ page }) => {
    const complete = withRequestId(
      loadFixture("routes/complete-match.json"),
      "req_e2e_complete",
    );
    await installApiMocks(page, {
      search: () => complete,
    });
    await page.goto("/");
    await pickStation(page, "from", "Car", /Carroll St/i);
    await pickStation(page, "to", "Bry", /Bryant Park/i);
    await page.getByTestId("open-line-picker").click();
    await page.getByRole("button", { name: /F train, not selected/i }).click();
    await page.getByRole("button", { name: /B train, not selected/i }).click();
    await page.getByRole("button", { name: /Save lines/i }).click();
    await page.getByTestId("find-routes").click();
    await expect(page.getByTestId("satisfaction-pill").first()).toContainText(
      /Uses all/i,
    );
  });

  test("multiple lines partial satisfaction with named omitted lines", async ({
    page,
  }) => {
    const partial = withRequestId(
      loadFixture("routes/partial-match.json"),
      "req_e2e_partial",
    );
    await installApiMocks(page, {
      search: () => partial,
    });
    await page.goto("/");
    await pickStation(page, "from", "Car", /Carroll St/i);
    await pickStation(page, "to", "Bry", /Bryant Park/i);
    await page.getByTestId("open-line-picker").click();
    for (const line of ["A", "G", "L"]) {
      await page
        .getByRole("button", {
          name: new RegExp(`${line} train, not selected`),
        })
        .click();
    }
    await page.getByRole("button", { name: /Save lines/i }).click();
    await page.getByTestId("find-routes").click();
    await expect(page.getByTestId("partial-banner")).toBeVisible();
    await expect(page.getByTestId("route-card").first()).toContainText(
      /Omits G/i,
    );
  });

  test("stale and schedule_only banners; synthetic only when payload says so", async ({
    page,
  }) => {
    const stale = withRequestId(
      loadFixture("routes/degraded-realtime.json"),
      "req_e2e_stale",
    );
    const mocks = await installApiMocks(page, { search: () => stale });
    await page.goto("/");
    await pickStation(page, "from", "Car", /Carroll St/i);
    await pickStation(page, "to", "Bry", /Bryant Park/i);
    await page.getByTestId("find-routes").click();
    await expect(page.getByTestId("data-mode-banner")).toHaveAttribute(
      "data-mode",
      "stale",
    );

    const schedule = withRequestId(
      loadFixture("routes/baseline-only.json"),
      "req_e2e_sched",
    );
    mocks.update({ search: () => schedule });
    await page.getByTestId("find-routes").click();
    await expect(page.getByTestId("data-mode-banner")).toHaveAttribute(
      "data-mode",
      "schedule_only",
    );

    const livePayload = {
      ...schedule,
      requestId: "req_e2e_live_mode",
      dataMode: "live",
      realtimeSnapshotId: "rt_e2e",
      freshness: {
        ...schedule.freshness,
        realtimeAgeSeconds: 12,
        warnings: [],
      },
    };
    mocks.update({ search: () => livePayload });
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/v1/routes/search") && r.ok(),
      ),
      page.getByTestId("find-routes").click(),
    ]);
    await expect(page.getByTestId("results-list")).toBeVisible();
    await expect(page.getByTestId("data-mode-banner")).toHaveCount(0);

    const synthetic = withRequestId(
      loadFixture("routes/complete-match.json"),
      "req_e2e_synth",
    );
    mocks.update({ search: () => synthetic });
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/v1/routes/search") && r.ok(),
      ),
      page.getByTestId("find-routes").click(),
    ]);
    await expect(page.getByTestId("data-mode-banner")).toHaveAttribute(
      "data-mode",
      "synthetic",
    );
  });

  test("no_transit_path, timeout, and API abort render honest failures", async ({
    page,
  }) => {
    const mocks = await installApiMocks(page, {
      search: () => ({
        status: 404,
        body: {
          error: {
            code: "no_transit_path",
            message: "No subway path was found between these places.",
            requestId: "req_e2e_nopath",
            details: {},
          },
        },
      }),
    });
    await page.goto("/");
    await pickStation(page, "from", "Car", /Carroll St/i);
    await pickStation(page, "to", "Bry", /Bryant Park/i);
    await page.getByTestId("find-routes").click();
    await expect(page.getByTestId("no-route-state")).toBeVisible();

    mocks.update({
      abortSearch: false,
      search: () => ({
        status: 504,
        body: {
          error: {
            code: "timeout",
            message: "Upstream routing timed out.",
            requestId: "req_e2e_timeout",
          },
        },
      }),
    });
    await page.getByRole("button", { name: /Edit trip/i }).click();
    await page.getByTestId("find-routes").click();
    await expect(page.getByTestId("timeout-state")).toBeVisible();

    mocks.update({ abortSearch: true, search: undefined });
    await page.getByRole("button", { name: /Try again/i }).click();
    await expect(page.getByTestId("unavailable-state")).toBeVisible();
    await expect(page.getByTestId("unavailable-state")).toContainText(
      /Could not reach|unavailable/i,
    );
  });

  test("keyboard-only search flow", async ({ page }) => {
    const baseline = withRequestId(
      loadFixture("routes/baseline-only.json"),
      "req_e2e_kbd",
    );
    await installApiMocks(page, { search: () => baseline });
    await page.goto("/");

    const from = page.getByPlaceholder(/Starting station/i);
    await from.focus();
    await from.pressSequentially("Car", { delay: 30 });
    await page.getByRole("listbox", { name: /Origin suggestions/i }).waitFor();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(from).toHaveValue("Carroll St");

    const to = page.getByPlaceholder(/Destination station/i);
    await to.focus();
    await to.pressSequentially("Bry", { delay: 30 });
    await page
      .getByRole("listbox", { name: /Destination suggestions/i })
      .waitFor();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(to).toHaveValue("Bryant Park");

    await page.getByTestId("open-line-picker").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /Save lines/i }).focus();
    await page.keyboard.press("Enter");
    await page.getByTestId("find-routes").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("results-list")).toBeVisible();
  });

  test("mobile viewport layout: readable results + 44px line toggles", async ({
    page,
  }) => {
    const complete = withRequestId(
      loadFixture("routes/complete-match.json"),
      "req_e2e_mobile",
    );
    await installApiMocks(page, { search: () => complete });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await pickStation(page, "from", "Car", /Carroll St/i);
    await pickStation(page, "to", "Bry", /Bryant Park/i);
    await page.getByTestId("open-line-picker").click();

    const lineBtn = page.getByRole("button", {
      name: /F train, not selected/i,
    });
    const box = await lineBtn.boundingBox();
    expect(box).toBeTruthy();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);

    const badges = page.locator("button.line-badge");
    expect(await badges.count()).toBeGreaterThan(9);

    await page
      .getByRole("button", { name: /Close preferred lines picker/i })
      .click();
    await page.getByTestId("find-routes").click();
    await expect(page.getByTestId("results-list")).toBeVisible();
    const card = page.getByTestId("route-card").first();
    await expect(card).toBeVisible();
    const cardBox = await card.boundingBox();
    expect(cardBox.width).toBeGreaterThan(200);
  });

  test("a11y smoke: search + results screens", async ({ page }) => {
    const baseline = withRequestId(
      loadFixture("routes/baseline-only.json"),
      "req_e2e_a11y",
    );
    await installApiMocks(page, { search: () => baseline });
    await page.goto("/");

    const searchScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const seriousSearch = searchScan.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      seriousSearch,
      seriousSearch.map((v) => v.id).join(", "),
    ).toEqual([]);

    await pickStation(page, "from", "Car", /Carroll St/i);
    await pickStation(page, "to", "Bry", /Bryant Park/i);
    await page.getByTestId("find-routes").click();
    await expect(page.getByTestId("results-list")).toBeVisible();

    const resultsScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const seriousResults = resultsScan.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      seriousResults,
      seriousResults.map((v) => v.id).join(", "),
    ).toEqual([]);
  });

  test("verify:no-fixtures script is clean after live build", async () => {
    const script = join(process.cwd(), "scripts/verify-no-fixtures.mjs");
    const out = execFileSync(process.execPath, [script], {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    expect(out).toMatch(/CLEAN/);
    expect(out).not.toMatch(/FIXTURE LEAK/);
  });

  test("arrive-by absent and attribution present", async ({ page }) => {
    await installApiMocks(page);
    await page.goto("/");
    await expect(
      page.getByRole("option", { name: /Arrive by/i }),
    ).toHaveCount(0);
    await expect(page.getByTestId("attribution")).toContainText(/MTA/);
    await expect(page.getByTestId("attribution")).toContainText(
      /not affiliated/i,
    );
  });

  test("public-beta limitations are discoverable and scope claims stay honest", async ({
    page,
  }) => {
    await installApiMocks(page);
    await page.goto("/");

    const limitationsLink = page.getByRole("link", {
      name: /public-beta limitations/i,
    });
    await expect(limitationsLink).toBeVisible();
    await limitationsLink.click();

    await expect(page).toHaveURL(/\/limitations$/);
    await expect(
      page.getByRole("heading", { name: /BetterMTA beta limitations/i }),
    ).toBeVisible();
    await expect(page.getByText(/NYC subway-first/i)).toBeVisible();
    await expect(page.getByText(/No account is required/i)).toBeVisible();
    await expect(page.getByText(/does not claim to beat/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Back to trip planner/i }),
    ).toHaveAttribute("href", "/");

    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = scan.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    );
    expect(
      serious,
      serious.map((violation) => violation.id).join(", "),
    ).toEqual([]);
  });

  test("production pages return nonce-based baseline security headers", async ({
    page,
  }) => {
    await installApiMocks(page);
    const cspConsoleErrors = [];
    const nonces = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /content security policy|refused to (?:load|execute|apply|connect)/i.test(
          message.text(),
        )
      ) {
        cspConsoleErrors.push(message.text());
      }
    });

    for (const path of ["/", "/limitations"]) {
      const response = await page.goto(path);
      expect(response).not.toBeNull();
      const headers = response.headers();
      const csp = headers["content-security-policy"] ?? "";
      const scriptSource =
        csp
          .split(";")
          .map((directive) => directive.trim())
          .find((directive) => directive.startsWith("script-src ")) ?? "";

      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
      expect(headers["permissions-policy"]).toContain("camera=()");
      expect(headers["permissions-policy"]).toContain("microphone=()");
      expect(headers["permissions-policy"]).toContain("geolocation=(self)");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      const nonce = scriptSource.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
      expect(nonce).toBeTruthy();
      nonces.push(nonce);
      expect(scriptSource).not.toContain("'unsafe-inline'");
      expect(scriptSource).not.toContain("'unsafe-eval'");
    }

    expect(new Set(nonces).size).toBe(2);
    expect(cspConsoleErrors).toEqual([]);
  });
});
