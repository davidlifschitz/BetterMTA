import { describe, expect, it, afterEach } from "vitest";
import { createTestApp, jsonHeaders } from "./helpers.js";

const completeRequest = {
  origin: { placeId: "pl_carroll_st" },
  destination: { placeId: "pl_bryant_park" },
  timing: { type: "depart_now" },
  selectedLineIds: ["F", "B"],
  clientContext: { viewport: "mobile", experimentOptIn: true },
};

describe("endpoints happy paths", () => {
  const apps: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (apps.length) {
      const a = apps.pop();
      await a?.close();
    }
  });

  it("POST /v1/routes/search complete-match", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers: jsonHeaders({ "x-request-id": "req_test_complete" }),
      payload: completeRequest,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBe("req_test_complete");
    expect(res.headers["x-contract-version"]).toBe("2026-07-30");
    const body = res.json();
    expect(body.dataMode).toBe("synthetic");
    expect(body.constrained.satisfactionSummary.completeMatchFound).toBe(true);
    expect(body.requestId).toBe("req_test_complete");
    expect(body.experiment.explanationVariant).toMatch(/concise|detailed/);
  });

  it("POST /v1/routes/search baseline-only when no selected lines", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers: jsonHeaders(),
      payload: {
        origin: { placeId: "pl_carroll_st" },
        destination: { placeId: "pl_bryant_park" },
        timing: { type: "depart_now" },
        selectedLineIds: [],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dataMode).toBe("schedule_only");
    expect(body.constrained.itineraries).toEqual([]);
    expect(body.constrained.satisfactionSummary.requestedCount).toBe(0);
  });

  it("POST /v1/routes/search partial-match", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers: jsonHeaders(),
      payload: {
        origin: { placeId: "pl_carroll_st" },
        destination: { placeId: "pl_bryant_park" },
        timing: { type: "depart_now" },
        selectedLineIds: ["A", "G", "L"],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dataMode).toBe("synthetic");
    expect(body.constrained.satisfactionSummary.completeMatchFound).toBe(false);
  });

  it("POST /v1/routes/search degraded-realtime (stale)", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers: jsonHeaders(),
      payload: {
        origin: { placeId: "pl_carroll_st" },
        destination: { placeId: "pl_bryant_park" },
        timing: { type: "depart_now" },
        selectedLineIds: ["7"],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dataMode).toBe("stale");
    expect(body.freshness.warnings.some((w: { code: string }) => w.code === "stale_realtime")).toBe(
      true,
    );
  });

  it("GET /v1/lines", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const res = await app.inject({ method: "GET", url: "/v1/lines" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-contract-version"]).toBe("2026-07-30");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    const body = res.json();
    expect(body.lines.length).toBeGreaterThan(0);
    expect(body.staticDatasetVersion).toBe("gtfs_fixture_v1");
  });

  it("sanitizes oversized X-Request-Id", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const longId = `req_${"a".repeat(200)}`;
    const res = await app.inject({
      method: "GET",
      url: "/v1/status",
      headers: { "x-request-id": longId },
    });
    expect(res.statusCode).toBe(200);
    expect(String(res.headers["x-request-id"]).length).toBeLessThanOrEqual(128);
  });

  it("records latency observations", async () => {
    const { app, deps } = await createTestApp();
    apps.push(app);
    deps.latency.reset();
    await app.inject({ method: "GET", url: "/health/live" });
    await app.inject({ method: "GET", url: "/v1/status" });
    const snap = deps.latency.snapshot();
    expect(snap.count).toBeGreaterThanOrEqual(2);
    expect(snap.p50Ms).not.toBeNull();
  });

  it("GET /v1/places/search", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const res = await app.inject({
      method: "GET",
      url: "/v1/places/search?q=union&limit=8",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.query).toBe("union");
    expect(body.places.length).toBeGreaterThan(0);
  });

  it("GET /v1/status", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const res = await app.inject({ method: "GET", url: "/v1/status" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dataMode).toBe("synthetic");
    expect(body.degraded).toBe(false);
  });

  it("GET /health/live", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const res = await app.inject({ method: "GET", url: "/health/live" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("GET /health/ready when healthy", async () => {
    const { app } = await createTestApp({ adapterReadyMode: "healthy" });
    apps.push(app);
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ready");
  });
});
