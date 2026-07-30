import path from "node:path";
import type {
  BenchmarkCase,
  RouteSearchRequest,
  RouteSearchResponse,
  SutKind,
  SystemUnderTest,
} from "./types.js";
import {
  CONDUCTOR_FIXTURES_DIR,
  QA_FIXTURES_DIR,
  RECORDED_RESPONSES_DIR,
  loadJson,
} from "./paths.js";
import { LiveSystemUnderTest } from "./sut-live.js";

export interface FixtureMapEntry {
  kind: SutKind;
  responseId: string;
}

/**
 * Fixture-backed SUT stub.
 * Maps each case's sut.responseId to a static RouteSearchResponse.
 * Supports conductor_fixture, qa_fixture, and recorded_response.
 * Does not call live network for those kinds.
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
    void request;
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
    if (entry.kind === "live") {
      throw new Error(
        `Case ${caseId} has sut.kind=live; use BETTERMTA_SUT=live (fixture mode cannot execute live cases)`
      );
    }
    const dir =
      entry.kind === "conductor_fixture"
        ? CONDUCTOR_FIXTURES_DIR
        : entry.kind === "recorded_response"
          ? RECORDED_RESPONSES_DIR
          : QA_FIXTURES_DIR;
    const filePath = path.join(dir, `${entry.responseId}.json`);
    return loadJson<RouteSearchResponse>(filePath);
  }
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

/**
 * Hybrid SUT for BETTERMTA_SUT=live:
 * - sut.kind=live (or classification=live) → LiveSystemUnderTest HTTP
 * - recorded_response / conductor_fixture / qa_fixture → disk fixtures
 */
export class HybridLiveSut implements SystemUnderTest {
  readonly name = "live-http-sut";
  private activeCase: BenchmarkCase | null = null;
  readonly live: LiveSystemUnderTest;
  private readonly fixture: FixtureSystemUnderTest;

  constructor(live: LiveSystemUnderTest, fixture: FixtureSystemUnderTest) {
    this.live = live;
    this.fixture = fixture;
  }

  setActiveCase(c: BenchmarkCase): void {
    this.activeCase = c;
  }

  usesLiveHttp(c: BenchmarkCase): boolean {
    return c.sut.kind === "live" || c.classification === "live";
  }

  async search(request: RouteSearchRequest): Promise<RouteSearchResponse> {
    if (!this.activeCase) {
      throw new Error("HybridLiveSut: active case not set");
    }
    if (this.usesLiveHttp(this.activeCase)) {
      return this.live.search(request);
    }
    return this.fixture.searchForCase(this.activeCase.caseId, request);
  }
}
