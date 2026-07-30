import path from "node:path";
import type { RouteSearchRequest, RouteSearchResponse, SystemUnderTest } from "./types.js";
import {
  CONDUCTOR_FIXTURES_DIR,
  QA_FIXTURES_DIR,
  loadJson,
} from "./paths.js";

export interface FixtureMapEntry {
  kind: "conductor_fixture" | "qa_fixture";
  responseId: string;
}

/**
 * Fixture-backed SUT stub.
 * Maps each case's sut.responseId to a static RouteSearchResponse.
 * Does not call live network or production routing.
 */
export class FixtureSystemUnderTest implements SystemUnderTest {
  readonly name = "fixture-sut";
  private readonly map: Map<string, FixtureMapEntry>;

  constructor(map: Map<string, FixtureMapEntry>) {
    this.map = map;
  }

  static fromCases(
    cases: Array<{ caseId: string; sut: FixtureMapEntry }>
  ): FixtureSystemUnderTest {
    const map = new Map<string, FixtureMapEntry>();
    for (const c of cases) {
      map.set(c.caseId, c.sut);
    }
    return new FixtureSystemUnderTest(map);
  }

  async search(request: RouteSearchRequest): Promise<RouteSearchResponse> {
    const key = requestKey(request);
    // Prefer explicit case mapping via selectedLineIds + origin place markers encoded in request.
    // The runner calls searchWithCaseId for precise mapping.
    void key;
    throw new Error(
      "FixtureSystemUnderTest.search requires searchForCase(caseId, request)"
    );
  }

  async searchForCase(
    caseId: string,
    _request: RouteSearchRequest
  ): Promise<RouteSearchResponse> {
    const entry = this.map.get(caseId);
    if (!entry) {
      throw new Error(`No fixture mapping for case ${caseId}`);
    }
    const dir =
      entry.kind === "conductor_fixture"
        ? CONDUCTOR_FIXTURES_DIR
        : QA_FIXTURES_DIR;
    const filePath = path.join(dir, `${entry.responseId}.json`);
    return loadJson<RouteSearchResponse>(filePath);
  }
}

function requestKey(request: RouteSearchRequest): string {
  return JSON.stringify({
    origin: request.origin,
    destination: request.destination,
    timing: request.timing,
    selectedLineIds: request.selectedLineIds ?? [],
  });
}

/** Adapter that exposes SystemUnderTest while routing through case-aware fixture lookup. */
export class CaseAwareFixtureSut implements SystemUnderTest {
  readonly name = "fixture-sut";
  private activeCaseId: string | null = null;
  private readonly inner: FixtureSystemUnderTest;

  constructor(inner: FixtureSystemUnderTest) {
    this.inner = inner;
  }

  setActiveCase(caseId: string): void {
    this.activeCaseId = caseId;
  }

  async search(request: RouteSearchRequest): Promise<RouteSearchResponse> {
    if (!this.activeCaseId) {
      throw new Error("CaseAwareFixtureSut: active case not set");
    }
    return this.inner.searchForCase(this.activeCaseId, request);
  }
}
