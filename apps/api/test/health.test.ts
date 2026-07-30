import { describe, expect, it, afterEach } from "vitest";
import { createTestApp } from "./helpers.js";

describe("health readiness", () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
  });

  it("ready when degraded and permitted", async () => {
    const { app } = await createTestApp({
      adapterReadyMode: "degraded",
      permitDegradedReady: true,
    });
    apps.push(app);
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ready");
    expect(res.json().dataMode).toBe("stale");
  });

  it("not_ready when static missing", async () => {
    const { app } = await createTestApp({
      adapterReadyMode: "not_ready_static",
    });
    apps.push(app);
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      status: "not_ready",
      reasons: ["static_dataset_missing"],
    });
  });

  it("not_ready when realtime down and degraded not permitted", async () => {
    const { app } = await createTestApp({
      adapterReadyMode: "not_ready_realtime",
      permitDegradedReady: false,
    });
    apps.push(app);
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json().status).toBe("not_ready");
    expect(res.json().reasons).toContain("realtime_unavailable");
  });

  it("status degraded fixture path", async () => {
    const { app } = await createTestApp({ adapterReadyMode: "degraded" });
    apps.push(app);
    const res = await app.inject({ method: "GET", url: "/v1/status" });
    expect(res.statusCode).toBe(200);
    expect(res.json().dataMode).toBe("stale");
    expect(res.json().degraded).toBe(true);
  });
});
