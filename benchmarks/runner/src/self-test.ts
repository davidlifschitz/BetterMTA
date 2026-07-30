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
import {
  collectSoftSubsetViolations,
  type SoftSubsetCase,
} from "./release-subset-policy.js";
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

function softSubsetSelfTest(): string[] {
  const hard: SoftSubsetCase = {
    caseId: "bmc-hard",
    classification: "synthetic_contract_fixture",
    sut: { kind: "qa_fixture", responseId: "x" },
  };
  const softTag: SoftSubsetCase = {
    caseId: "bmc-soft-tag",
    classification: "synthetic_contract_fixture",
    tags: ["soft_feasibility"],
    sut: { kind: "qa_fixture", responseId: "x" },
  };
  const pending: SoftSubsetCase = {
    caseId: "bmc-pending",
    classification: "pending_live_integration",
    sut: { kind: "qa_fixture", responseId: "x" },
  };
  const live: SoftSubsetCase = {
    caseId: "bmc-live",
    classification: "live",
    sut: { kind: "live" },
  };

  const failures: string[] = [];

  const ok = collectSoftSubsetViolations([hard], ["bmc-hard"], "fixture");
  if (ok.length !== 0) {
    failures.push(
      `soft-subset: hard case unexpectedly violated: ${ok.join("; ")}`
    );
  }

  const softHits = collectSoftSubsetViolations(
    [softTag, pending, live, hard],
    ["bmc-soft-tag", "bmc-pending", "bmc-live", "bmc-hard"],
    "fixture"
  );
  const expectedIds = ["bmc-soft-tag", "bmc-pending", "bmc-live"];
  for (const id of expectedIds) {
    if (!softHits.some((v) => v.startsWith(`${id}:`))) {
      failures.push(
        `soft-subset: expected violation for ${id} under fixture SUT`
      );
    }
  }
  if (softHits.some((v) => v.startsWith("bmc-hard:"))) {
    failures.push("soft-subset: hard case must not be flagged");
  }

  // Live cases under live SUT are not soft — subset may include them (gate still
  // requires merge-blocking invariants). Soft tag / pending remain forbidden.
  const liveMode = collectSoftSubsetViolations(
    [live, softTag],
    ["bmc-live", "bmc-soft-tag"],
    "live"
  );
  if (liveMode.some((v) => v.startsWith("bmc-live:"))) {
    failures.push(
      "soft-subset: live case under live SUT must not be soft-flagged"
    );
  }
  if (!liveMode.some((v) => v.startsWith("bmc-soft-tag:"))) {
    failures.push(
      "soft-subset: soft_feasibility must still violate under live SUT"
    );
  }

  return failures;
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

  const softSubsetFailures = softSubsetSelfTest();
  if (softSubsetFailures.length === 0) {
    console.log("  OK  soft-subset policy rejects soft/pending/fixture-live");
  }

  if (unexpectedPasses.length || softSubsetFailures.length) {
    console.error("");
    if (unexpectedPasses.length) {
      console.error(
        `SELF-TEST FAIL: ${unexpectedPasses.length} expected-fail case(s) did not fail`
      );
      for (const line of unexpectedPasses) console.error(`  BAD ${line}`);
    }
    if (softSubsetFailures.length) {
      console.error(
        `SELF-TEST FAIL: ${softSubsetFailures.length} soft-subset policy check(s) failed`
      );
      for (const line of softSubsetFailures) console.error(`  BAD ${line}`);
    }
    process.exit(1);
  }
  console.log(
    `SELF-TEST PASS: ${confirmedFails.length}/${CASES.length} named invariants failed as expected; soft-subset policy OK`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(`SELF-TEST ERROR: ${(err as Error).message}`);
  process.exit(2);
});
