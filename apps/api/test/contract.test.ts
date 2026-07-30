import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, afterEach } from "vitest";
import { createTestApp, jsonHeaders } from "./helpers.js";
import { loadValidators } from "../src/validation/ajv.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const contractsRoot = path.join(repoRoot, "contracts");

describe("contract schema validation of live responses", () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
  });

  const validators = loadValidators(contractsRoot);

  it("route-search-response validates", async () => {
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
        selectedLineIds: ["F", "B"],
      },
    });
    expect(res.statusCode).toBe(200);
    const ok = validators.validateRouteSearchResponse(res.json());
    expect(ok, JSON.stringify(validators.validateRouteSearchResponse.errors)).toBe(
      true,
    );
  });

  it("partial and stale route responses validate", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    for (const selectedLineIds of [["A", "G", "L"], ["7"]]) {
      const res = await app.inject({
        method: "POST",
        url: "/v1/routes/search",
        headers: jsonHeaders(),
        payload: {
          origin: { placeId: "pl_carroll_st" },
          destination: { placeId: "pl_bryant_park" },
          timing: { type: "depart_now" },
          selectedLineIds,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(validators.validateRouteSearchResponse(res.json())).toBe(true);
    }
  });

  it("lines-response validates", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const res = await app.inject({ method: "GET", url: "/v1/lines" });
    expect(validators.validateLinesResponse(res.json())).toBe(true);
  });

  it("place-search-response validates", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const res = await app.inject({
      method: "GET",
      url: "/v1/places/search?q=union",
    });
    expect(validators.validatePlaceSearchResponse(res.json())).toBe(true);
  });

  it("status-response validates", async () => {
    const { app } = await createTestApp();
    apps.push(app);
    const res = await app.inject({ method: "GET", url: "/v1/status" });
    expect(validators.validateStatusResponse(res.json())).toBe(true);
  });

  it("api-error validates for typed failures", async () => {
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
    expect(validators.validateApiError(res.json())).toBe(true);
  });
});

describe("openapi locked path table", () => {
  it("implemented routes match the six locked OpenAPI paths", async () => {
    const yaml = await import("js-yaml");
    const openapiPath = path.join(contractsRoot, "openapi/bettermta-v1.yaml");
    const doc = yaml.load(fs.readFileSync(openapiPath, "utf8")) as {
      paths: Record<string, Record<string, unknown>>;
    };

    const locked = Object.entries(doc.paths).flatMap(([p, methods]) =>
      Object.keys(methods).map((m) => `${m.toUpperCase()} ${p}`),
    );
    expect(locked.sort()).toEqual(
      [
        "POST /v1/routes/search",
        "GET /v1/lines",
        "GET /v1/places/search",
        "GET /v1/status",
        "GET /health/live",
        "GET /health/ready",
      ].sort(),
    );

    const { app } = await createTestApp();
    const routes = app.printRoutes({ commonPrefix: false });
    for (const expected of [
      "/v1/routes/search (POST",
      "/v1/lines (GET",
      "/v1/places/search (GET",
      "/v1/status (GET",
      "/health/live (GET",
      "/health/ready (GET",
    ]) {
      expect(routes).toContain(expected.split(" (")[0]!);
    }
    await app.close();
  });
});
