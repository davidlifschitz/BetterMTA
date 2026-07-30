import { describe, expect, it } from "vitest";
import { selectRouteFixture } from "../src/adapters/fixture/selection.js";
import { assignExplanationVariant } from "../src/experiments/assign.js";
import { buildRouteCacheKey } from "../src/cache/routeCacheKey.js";
import { LatencyHistogram } from "../src/metrics/latency.js";
import {
  newRequestId,
  sanitizeRequestId,
} from "../src/services/routeSearch.js";
import { MAX_REQUEST_ID_LENGTH } from "../src/constants.js";

describe("fixture selection", () => {
  it("selects baseline for empty lines", () => {
    const s = selectRouteFixture({
      originKey: "place:pl_carroll_st",
      destinationKey: "place:pl_bryant_park",
      selectedLineIds: [],
    });
    expect(s).toMatchObject({ kind: "fixture", fixture: "baseline-only" });
  });

  it("selects complete-match for F+B", () => {
    const s = selectRouteFixture({
      originKey: "place:pl_carroll_st",
      destinationKey: "place:pl_bryant_park",
      selectedLineIds: ["B", "F"],
    });
    expect(s).toMatchObject({ kind: "fixture", fixture: "complete-match" });
  });

  it("selects degraded for 7", () => {
    const s = selectRouteFixture({
      originKey: "place:pl_carroll_st",
      destinationKey: "place:pl_bryant_park",
      selectedLineIds: ["7"],
    });
    expect(s).toMatchObject({ kind: "fixture", fixture: "degraded-realtime" });
  });

  it("selects partial otherwise", () => {
    const s = selectRouteFixture({
      originKey: "place:pl_carroll_st",
      destinationKey: "place:pl_bryant_park",
      selectedLineIds: ["A", "G", "L"],
    });
    expect(s).toMatchObject({ kind: "fixture", fixture: "partial-match" });
  });
});

describe("experiments + cache key", () => {
  it("assigns explanation variant deterministically", () => {
    expect(assignExplanationVariant("req_a")).toBe(
      assignExplanationVariant("req_a"),
    );
    expect(assignExplanationVariant("req_a", "seed-1")).toBe(
      assignExplanationVariant("req_a", "seed-1"),
    );
  });

  it("builds stable route cache keys", () => {
    const a = buildRouteCacheKey({
      request: {
        origin: { placeId: "pl_a" },
        destination: { placeId: "pl_b" },
        timing: { type: "depart_now" },
        selectedLineIds: ["B", "F"],
      },
      selectedLineIds: ["F", "B"],
      staticDatasetVersion: "gtfs_fixture_v1",
      realtimeSnapshotId: "rt_fixture_v1",
      explanationVariant: "concise",
      nowMs: 1_700_000_000_000,
    });
    const b = buildRouteCacheKey({
      request: {
        origin: { placeId: "pl_a" },
        destination: { placeId: "pl_b" },
        timing: { type: "depart_now" },
        selectedLineIds: ["F", "B"],
      },
      selectedLineIds: ["B", "F"],
      staticDatasetVersion: "gtfs_fixture_v1",
      realtimeSnapshotId: "rt_fixture_v1",
      explanationVariant: "concise",
      nowMs: 1_700_000_000_000,
    });
    expect(a).toBe(b);
  });
});

describe("request id sanitization", () => {
  it("strips control chars and caps length", () => {
    expect(sanitizeRequestId("req_\u0001ok")).toBe("req_ok");
    const long = "r".repeat(200);
    expect(sanitizeRequestId(long)?.length).toBe(MAX_REQUEST_ID_LENGTH);
    expect(newRequestId("\u0000\u0007")).toMatch(/^req_/);
  });
});

describe("latency histogram", () => {
  it("records counts and approximate percentiles", () => {
    const h = new LatencyHistogram([10, 50, 100]);
    for (let i = 0; i < 50; i++) h.observe(5);
    for (let i = 0; i < 40; i++) h.observe(40);
    for (let i = 0; i < 9; i++) h.observe(80);
    h.observe(200);
    const snap = h.snapshot();
    expect(snap.count).toBe(100);
    expect(snap.p50Ms).toBe(10);
    expect(snap.p95Ms).toBe(100);
    expect(snap.p99Ms).toBe(100);
    expect(snap.maxMs).toBe(200);
  });
});
