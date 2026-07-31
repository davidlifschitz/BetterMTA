/**
 * P1 Wave 1E — API harness for acceptance rows that are typed errors
 * (not RouteSearchResponse benchmark fixtures):
 *   #7 failed geocode / unknown place
 *   #8 provider timeout
 *  #13 insufficient_candidate_coverage
 *  #16 privacy-safe log redaction
 *
 * Does not implement product features — exercises existing fixture adapter hooks.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, jsonHeaders } from "./helpers.js";
import { redactSensitive } from "../src/logging/logger.js";

const apps: FastifyInstance[] = [];

afterEach(async () => {
  while (apps.length) {
    const app = apps.pop();
    if (app) await app.close();
  }
});

describe("P1 acceptance harness (API)", () => {
  it("matrix #7 — unknown_place for failed / unknown geocode PlaceRef", async () => {
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

  it("matrix #8 — timeout when upstream hangs (pl_timeout)", async () => {
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

  it("matrix #13 — insufficient_candidate_coverage on budget exhaustion hook", async () => {
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
        selectedLineIds: ["7", "2"],
      },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("insufficient_candidate_coverage");
  });

  it("matrix #16 — redactSensitive strips coords and raw query text", () => {
    const redacted = redactSensitive({
      requestId: "req_p1_privacy",
      query: "277 Park private office",
      q: "secret street",
      originLat: 40.7553,
      proximityLon: -73.9755,
      coordinate: { lat: 40.75, lon: -73.99 },
      selectedLineCount: 2,
    });
    expect(redacted.requestId).toBe("req_p1_privacy");
    expect(redacted.selectedLineCount).toBe(2);
    expect(redacted.query).toBe("[redacted]");
    expect(redacted.q).toBe("[redacted]");
    expect(redacted.originLat).toBe("[redacted]");
    expect(redacted.proximityLon).toBe("[redacted]");
    expect(redacted.coordinate).toBe("[redacted]");
  });
});
