import { describe, expect, it, afterEach } from "vitest";
import { createTestApp, jsonHeaders } from "./helpers.js";
import { FixedWindowRateLimiter } from "../src/plugins/rateLimit.js";
import type { RoutingAdapter } from "../src/adapters/types.js";
import type { RouteSearchResponse } from "../src/types.js";

describe("typed errors", () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
  });

  it("invalid_input for bad schema", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers: jsonHeaders(),
      payload: { origin: { placeId: "pl_carroll_st" } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_input");
  });

  it("invalid_input for >5 selected lines", async () => {
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
        selectedLineIds: ["1", "2", "7", "A", "B", "D"],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_input");
  });

  it("invalid_input for duplicate selected lines", async () => {
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
        selectedLineIds: ["F", "B", "F"],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_input");
  });

  it("invalid_input for oversized payload", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const big = "x".repeat(20_000);
    const res = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers: jsonHeaders(),
      payload: {
        origin: { placeId: "pl_carroll_st" },
        destination: { placeId: "pl_bryant_park" },
        timing: { type: "depart_now" },
        selectedLineIds: ["F"],
        clientContext: { viewport: "mobile", experimentOptIn: true },
        // additionalProperties or body too large → invalid_input
        pad: big,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_input");
  });

  it("unknown_place", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers: jsonHeaders(),
      payload: {
        origin: { placeId: "pl_does_not_exist" },
        destination: { placeId: "pl_bryant_park" },
        timing: { type: "depart_now" },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("unknown_place");
  });

  it("unknown_line", async () => {
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
        selectedLineIds: ["Z9"],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("unknown_line");
    expect(res.json().error.details.unknownLineIds).toContain("Z9");
  });

  it("no_transit_path", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers: jsonHeaders(),
      payload: {
        origin: { placeId: "pl_unreachable" },
        destination: { placeId: "pl_bryant_park" },
        timing: { type: "depart_now" },
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("no_transit_path");
  });

  it("insufficient_candidate_coverage", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers: jsonHeaders(),
      payload: {
        origin: { placeId: "pl_coverage_fail" },
        destination: { placeId: "pl_bryant_park" },
        timing: { type: "depart_now" },
      },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("insufficient_candidate_coverage");
  });

  it("data_unavailable", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers: jsonHeaders(),
      payload: {
        origin: { placeId: "pl_data_unavailable" },
        destination: { placeId: "pl_bryant_park" },
        timing: { type: "depart_now" },
      },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("data_unavailable");
  });

  it("timeout", async () => {
    const { app } = await createTestApp({ requestTimeoutMs: 50 });
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers: jsonHeaders(),
      payload: {
        origin: { placeId: "pl_timeout" },
        destination: { placeId: "pl_bryant_park" },
        timing: { type: "depart_now" },
      },
    });
    expect(res.statusCode).toBe(504);
    expect(res.json().error.code).toBe("timeout");
  });

  it("hard timeout when routing adapter ignores abort", async () => {
    const hanging: RoutingAdapter = {
      async searchRoutes(): Promise<RouteSearchResponse> {
        // Never resolves and never observes AbortSignal.
        return new Promise(() => undefined);
      },
    };
    const { app } = await createTestApp(
      { requestTimeoutMs: 40 },
      { routing: hanging },
    );
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers: jsonHeaders(),
      payload: {
        origin: { placeId: "pl_carroll_st" },
        destination: { placeId: "pl_bryant_park" },
        timing: { type: "depart_now" },
        selectedLineIds: ["F", "B"],
      },
    });
    expect(res.statusCode).toBe(504);
    expect(res.json().error.code).toBe("timeout");
  });

  it("rate_limited on route search", async () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000);
    const { app } = await createTestApp({}, { rateLimiter: limiter });
    apps.push(app);
    const payload = {
      origin: { placeId: "pl_carroll_st" },
      destination: { placeId: "pl_bryant_park" },
      timing: { type: "depart_now" },
      selectedLineIds: ["F", "B"],
    };
    const headers = jsonHeaders({ "x-rate-limit-key": "burst-client" });
    const first = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers,
      payload,
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers,
      payload,
    });
    expect(second.statusCode).toBe(429);
    expect(second.json().error.code).toBe("rate_limited");
  });

  it("rate_limited on places search", async () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000);
    const { app } = await createTestApp({}, { rateLimiter: limiter });
    apps.push(app);
    const headers = { "x-rate-limit-key": "places-burst" };
    expect(
      (await app.inject({ method: "GET", url: "/v1/places/search?q=union", headers }))
        .statusCode,
    ).toBe(200);
    const second = await app.inject({
      method: "GET",
      url: "/v1/places/search?q=union",
      headers,
    });
    expect(second.statusCode).toBe(429);
    expect(second.json().error.code).toBe("rate_limited");
  });

  it("rate_limited on lines and status", async () => {
    const readLimiter = new FixedWindowRateLimiter(1, 60_000);
    const { app } = await createTestApp({}, { readRateLimiter: readLimiter });
    apps.push(app);
    const headers = { "x-rate-limit-key": "read-burst" };
    expect(
      (await app.inject({ method: "GET", url: "/v1/lines", headers })).statusCode,
    ).toBe(200);
    const secondLines = await app.inject({
      method: "GET",
      url: "/v1/lines",
      headers,
    });
    expect(secondLines.statusCode).toBe(429);
    expect(secondLines.json().error.code).toBe("rate_limited");

    const readLimiter2 = new FixedWindowRateLimiter(1, 60_000);
    const { app: app2 } = await createTestApp(
      {},
      { readRateLimiter: readLimiter2 },
    );
    apps.push(app2);
    expect(
      (await app2.inject({ method: "GET", url: "/v1/status", headers })).statusCode,
    ).toBe(200);
    const secondStatus = await app2.inject({
      method: "GET",
      url: "/v1/status",
      headers,
    });
    expect(secondStatus.statusCode).toBe(429);
    expect(secondStatus.json().error.code).toBe("rate_limited");
  });

  it("ignores X-Rate-Limit-Key when allowRateLimitKey is off", async () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000);
    const { app } = await createTestApp(
      { allowRateLimitKey: false },
      { rateLimiter: limiter },
    );
    apps.push(app);
    const payload = {
      origin: { placeId: "pl_carroll_st" },
      destination: { placeId: "pl_bryant_park" },
      timing: { type: "depart_now" },
      selectedLineIds: ["F", "B"],
    };
    const first = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers: jsonHeaders({ "x-rate-limit-key": "spoof-a" }),
      payload,
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers: jsonHeaders({ "x-rate-limit-key": "spoof-b" }),
      payload,
    });
    expect(second.statusCode).toBe(429);
    expect(second.json().error.code).toBe("rate_limited");
  });

  it("ignores X-Forwarded-For when trustProxy is off", async () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000);
    const { app } = await createTestApp(
      { trustProxy: false, allowRateLimitKey: false },
      { rateLimiter: limiter },
    );
    apps.push(app);
    const payload = {
      origin: { placeId: "pl_carroll_st" },
      destination: { placeId: "pl_bryant_park" },
      timing: { type: "depart_now" },
      selectedLineIds: ["F", "B"],
    };
    const first = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers: jsonHeaders({ "x-forwarded-for": "203.0.113.10" }),
      payload,
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers: jsonHeaders({ "x-forwarded-for": "203.0.113.99" }),
      payload,
    });
    // Same socket IP bucket — XFF must not create a fresh bucket.
    expect(second.statusCode).toBe(429);
    expect(second.json().error.code).toBe("rate_limited");
  });

  it("places invalid q", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const res = await app.inject({ method: "GET", url: "/v1/places/search" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_input");
  });

  it("places q longer than 100 chars", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const q = "a".repeat(101);
    const res = await app.inject({
      method: "GET",
      url: `/v1/places/search?q=${q}`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_input");
  });
});
