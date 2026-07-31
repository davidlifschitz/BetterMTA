import { describe, expect, it, afterEach } from "vitest";
import { createTestApp, jsonHeaders } from "./helpers.js";

describe("caching", () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
  });

  it("caches /v1/lines by staticDatasetVersion", async () => {
    const { app, deps } = await createTestApp({ linesCacheTtlMs: 60_000 });
    apps.push(app);
    const first = await app.inject({ method: "GET", url: "/v1/lines" });
    expect(first.statusCode).toBe(200);
    expect(deps.linesCache.size()).toBe(1);
    const second = await app.inject({ method: "GET", url: "/v1/lines" });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
  });

  it("caches route search with documented key components", async () => {
    const { app, deps } = await createTestApp({ routeCacheTtlMs: 60_000 });
    apps.push(app);
    const payload = {
      origin: { placeId: "pl_carroll_st" },
      destination: { placeId: "pl_bryant_park" },
      timing: { type: "depart_now" },
      selectedLineIds: ["F", "B"],
    };
    const headers = jsonHeaders({
      "x-request-id": "req_cache_a",
      "x-experiment-seed": "fixed-seed",
    });
    const first = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers,
      payload,
    });
    expect(first.statusCode).toBe(200);
    expect(deps.routeCache.size()).toBe(1);
    const second = await app.inject({
      method: "POST",
      url: "/v1/routes/search",
      headers: jsonHeaders({
        "x-request-id": "req_cache_b",
        "x-experiment-seed": "fixed-seed",
      }),
      payload,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().constrained).toEqual(first.json().constrained);
    expect(second.json().requestId).toBe("req_cache_b");
  });
});
