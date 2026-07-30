#!/usr/bin/env node
/**
 * Negative / self-test harness.
 * Calls runInvariants directly against known-bad fixture responses and asserts
 * each named invariant FAILS. Exit 0 only when every expected-fail fails.
 * Exit 1 if any expected-fail unexpectedly passes (or skips).
 * Exit 2 on harness/config errors.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInvariants } from "./invariants/index.js";
import { loadJson } from "./paths.js";
import type {
  BenchmarkCase,
  InvariantId,
  RouteSearchRequest,
  RouteSearchResponse,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NEGATIVE_DIR = path.resolve(
  __dirname,
  "../../fixtures/negative-responses"
);

interface NegativeCase {
  name: string;
  fixture: string;
  invariantId: InvariantId;
  selectedLineIds: string[];
  classification?: BenchmarkCase["classification"];
  sutKind?: BenchmarkCase["sut"]["kind"];
  expectedFeasibility?: BenchmarkCase["expectedFeasibility"];
}

const CASES: NegativeCase[] = [
  {
    name: "too-many-itineraries",
    fixture: "too-many-itineraries.json",
    invariantId: "max_three_itineraries",
    selectedLineIds: ["A", "C"],
  },
  {
    name: "live-data-mode",
    fixture: "live-data-mode.json",
    invariantId: "honest_data_mode",
    selectedLineIds: ["F", "B"],
    classification: "synthetic_contract_fixture",
    sutKind: "conductor_fixture",
  },
  {
    name: "dishonest-requested-lines",
    fixture: "dishonest-requested-lines.json",
    invariantId: "satisfaction_accounting",
    selectedLineIds: ["A", "B"],
  },
  {
    name: "wrong-omitted-set",
    fixture: "wrong-omitted-set.json",
    invariantId: "satisfaction_accounting",
    selectedLineIds: ["A", "C"],
  },
  {
    name: "inverted-ranking",
    fixture: "inverted-ranking.json",
    invariantId: "complete_beats_partial",
    selectedLineIds: ["A", "C"],
  },
  {
    name: "duplicate-itinerary-ids",
    fixture: "duplicate-itinerary-ids.json",
    invariantId: "valid_itinerary_structure",
    selectedLineIds: ["A", "C"],
  },
];

function makeCase(nc: NegativeCase): BenchmarkCase {
  return {
    caseId: `bmc-selftest-${nc.name}`,
    title: `Self-test negative: ${nc.name}`,
    classification: nc.classification ?? "synthetic_contract_fixture",
    origin: { placeId: "pl_selftest_origin" },
    destination: { placeId: "pl_selftest_dest" },
    timing: { type: "depart_now" },
    selectedLineIds: nc.selectedLineIds,
    expectedFeasibility: nc.expectedFeasibility ?? "complete",
    minimumSatisfactionCount: 0,
    invariantAssertions: [nc.invariantId],
    humanReviewNotes: "Negative self-test fixture — not a real trip.",
    staticDatasetVersion: "gtfs_fixture_v1",
    realtimeFixtureVersion: "rt_fixture_v1",
    sut: {
      kind: nc.sutKind ?? "qa_fixture",
      responseId: "selftest",
    },
  };
}

function makeRequest(nc: NegativeCase): RouteSearchRequest {
  return {
    origin: { placeId: "pl_selftest_origin" },
    destination: { placeId: "pl_selftest_dest" },
    timing: { type: "depart_now" },
    selectedLineIds: nc.selectedLineIds,
  };
}

async function main() {
  const unexpectedPasses: string[] = [];
  const confirmedFails: string[] = [];

  for (const nc of CASES) {
    const response = await loadJson<RouteSearchResponse>(
      path.join(NEGATIVE_DIR, nc.fixture)
    );
    const results = await runInvariants([nc.invariantId], {
      benchmarkCase: makeCase(nc),
      request: makeRequest(nc),
      response,
    });
    const result = results[0];
    if (!result) {
      unexpectedPasses.push(`${nc.name}: no result returned`);
      continue;
    }
    if (result.status === "fail") {
      confirmedFails.push(
        `${nc.name} :: ${nc.invariantId} FAIL (expected): ${result.message}`
      );
    } else {
      unexpectedPasses.push(
        `${nc.name} :: ${nc.invariantId} status=${result.status} (expected fail): ${result.message}`
      );
    }
  }

  console.log("BetterMTA invariant self-test (expected failures)");
  for (const line of confirmedFails) console.log(`  OK  ${line}`);
  if (unexpectedPasses.length) {
    console.error("");
    console.error(
      `SELF-TEST FAIL: ${unexpectedPasses.length} expected-fail case(s) did not fail`
    );
    for (const line of unexpectedPasses) console.error(`  BAD ${line}`);
    process.exit(1);
  }
  console.log(
    `SELF-TEST PASS: ${confirmedFails.length}/${CASES.length} named invariants failed as expected`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(`SELF-TEST ERROR: ${(err as Error).message}`);
  process.exit(2);
});
