import { describe, expect, it } from "vitest";

/**
 * ENV-gated integration against a real local stack:
 * - data internal server (BETTERMTA_DATA_INTERNAL_URL, default :8081)
 * - OTP (BETTERMTA_OTP_URL, default :8090)
 * - requires @bettermta/routing createOtpCandidateProvider build
 *
 * Skips cleanly unless BETTERMTA_LIVE_STACK is set.
 */
const liveStack = process.env.BETTERMTA_LIVE_STACK === "1";

describe.skipIf(!liveStack)("live stack integration", () => {
  it("searches a real route via live adapters", async () => {
    const { buildApp } = await import("../src/app.js");
    const { createLogger } = await import("../src/logging/logger.js");

    const { app } = await buildApp({
      config: {
        adapterMode: "live",
        logLevel: "warn",
        requestTimeoutMs: 8_000,
        dataInternalUrl:
          process.env.BETTERMTA_DATA_INTERNAL_URL ?? "http://localhost:8081",
        dataInternalToken: process.env.BETTERMTA_DATA_INTERNAL_TOKEN ?? null,
        otpUrl: process.env.BETTERMTA_OTP_URL ?? "http://localhost:8090",
        otpTimeoutMs: 4_000,
        otpGraphVersion: process.env.BETTERMTA_OTP_GRAPH_VERSION ?? null,
      },
      deps: { logger: createLogger("warn") },
    });

    try {
      const ready = await app.inject({ method: "GET", url: "/health/ready" });
      expect(ready.statusCode).toBe(200);

      const lines = await app.inject({ method: "GET", url: "/v1/lines" });
      expect(lines.statusCode).toBe(200);
      expect(lines.json().lines.length).toBeGreaterThan(0);

      const places = await app.inject({
        method: "GET",
        url: "/v1/places/search?q=Carroll&limit=5",
      });
      expect(places.statusCode).toBe(200);
      const origin = places.json().places[0];
      expect(origin).toBeTruthy();

      const destPlaces = await app.inject({
        method: "GET",
        url: "/v1/places/search?q=Bryant&limit=5",
      });
      const destination = destPlaces.json().places[0];
      expect(destination).toBeTruthy();

      const search = await app.inject({
        method: "POST",
        url: "/v1/routes/search",
        headers: { "content-type": "application/json" },
        payload: {
          origin: { stationId: origin.stationId ?? origin.placeId },
          destination: {
            stationId: destination.stationId ?? destination.placeId,
          },
          timing: { type: "depart_now" },
          selectedLineIds: ["F"],
        },
      });
      // Accept success or honest typed failure — never opaque 500.
      expect([200, 404, 503, 504]).toContain(search.statusCode);
      if (search.statusCode === 200) {
        expect(search.json().dataMode).not.toBe("synthetic");
        expect(search.json().staticDatasetVersion).toBeTruthy();
      } else {
        expect(search.json().error?.code).toBeTruthy();
      }
    } finally {
      await app.close();
    }
  });
});

describe("live stack gate", () => {
  it("is env-gated via BETTERMTA_LIVE_STACK=1", () => {
    // Offline default: skipIf hides the real-stack body. Opt in with BETTERMTA_LIVE_STACK=1.
    expect(typeof liveStack).toBe("boolean");
    if (!process.env.BETTERMTA_LIVE_STACK) {
      expect(liveStack).toBe(false);
    }
  });
});
