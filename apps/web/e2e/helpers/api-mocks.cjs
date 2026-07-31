const { assertValidSchema, loadFixture } = require("./schema.cjs");

const MOCK_API_ORIGIN = "http://127.0.0.1:3999";

function json(route, status, body) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function defaultLines() {
  const base = loadFixture("lines/subway-lines.json");
  const extra = ["C", "D", "E", "J", "M", "N", "Q", "R", "W"].map((id) => ({
    lineId: id,
    label: id,
    displayName: `${id} train`,
    color: "#0039A6",
    textColor: "#FFFFFF",
    isActive: true,
    gtfsRouteIds: [id],
  }));
  const ids = new Set(base.lines.map((l) => l.lineId));
  return {
    ...base,
    staticDatasetVersion: "gtfs_e2e_v1",
    lines: [...base.lines, ...extra.filter((l) => !ids.has(l.lineId))],
  };
}

function defaultPlaces(q) {
  const fixture = loadFixture("places/place-search.json");
  const places = fixture.places.filter((p) =>
    p.label.toLowerCase().includes(q.toLowerCase()),
  );
  const extras = [
    {
      placeId: "pl_carroll_st",
      label: "Carroll St",
      kind: "station",
      stationId: "st_carroll",
      borough: "Brooklyn",
      lat: 40.6793,
      lon: -73.9954,
    },
    {
      placeId: "pl_bryant_park",
      label: "Bryant Park",
      kind: "station",
      stationId: "st_bryant",
      borough: "Manhattan",
      lat: 40.7536,
      lon: -73.9832,
    },
  ];
  const merged = [...places];
  for (const e of extras) {
    if (
      e.label.toLowerCase().includes(q.toLowerCase()) &&
      !merged.some((p) => p.placeId === e.placeId)
    ) {
      merged.push(e);
    }
  }
  return {
    contractVersion: "2026-07-30",
    query: q,
    places: merged,
  };
}

/**
 * Intercept live API origin and serve contract-validated mocks.
 */
async function installApiMocks(page, handlers = {}) {
  const state = { handlers };
  const pattern = `${MOCK_API_ORIGIN}/v1/**`;
  await page.unroute(pattern).catch(() => undefined);

  const linesBody = handlers.lines ?? defaultLines();
  await assertValidSchema("lines-response.schema.json", linesBody);

  await page.route(pattern, async (route) => {
    const h = state.handlers;
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;

    if (path === "/v1/lines") {
      return json(route, 200, linesBody);
    }

    if (path === "/v1/status") {
      const body = h.status ?? {
        contractVersion: "2026-07-30",
        dataMode: "live",
        staticDatasetVersion: "gtfs_e2e_v1",
        realtimeSnapshotId: "rt_e2e",
        realtimeAgeSeconds: 12,
        degraded: false,
        messages: [],
      };
      await assertValidSchema("status-response.schema.json", body);
      return json(route, 200, body);
    }

    if (path === "/v1/places/search") {
      const q = url.searchParams.get("q") ?? "";
      const body = h.places?.(q) ?? defaultPlaces(q);
      await assertValidSchema("place-search-response.schema.json", body);
      return json(route, 200, body);
    }

    if (path === "/v1/routes/search" && req.method() === "POST") {
      if (h.abortSearch) {
        return route.abort("failed");
      }
      const requestBody = req.postDataJSON();
      const result = h.search
        ? h.search(requestBody)
        : loadFixture("routes/baseline-only.json");
      const wrapped =
        result && typeof result === "object" && result !== null && "body" in result;
      const status = wrapped ? (result.status ?? 200) : 200;
      const body = wrapped ? result.body : result;

      if (body && typeof body === "object" && body !== null && "error" in body) {
        await assertValidSchema("api-error.schema.json", body);
      } else {
        await assertValidSchema("route-search-response.schema.json", body);
      }
      return json(route, status, body);
    }

    return json(route, 404, {
      error: {
        code: "internal_error",
        message: `Unmocked path ${path}`,
        requestId: "e2e",
      },
    });
  });

  return {
    update(next) {
      state.handlers = { ...state.handlers, ...next };
    },
  };
}

async function pickStation(page, field, query, optionName) {
  const placeholder =
    field === "from" ? /Starting station/i : /Destination station/i;
  const listLabel =
    field === "from" ? /Origin suggestions/i : /Destination suggestions/i;
  const input = page.getByPlaceholder(placeholder);
  await input.fill("");
  await input.pressSequentially(query, { delay: 25 });
  await page.getByRole("listbox", { name: listLabel }).waitFor();
  await page.getByRole("option", { name: optionName }).click();
}

module.exports = {
  MOCK_API_ORIGIN,
  installApiMocks,
  pickStation,
};
