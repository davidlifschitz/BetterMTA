import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BenchmarkReport, SutMode } from "./types.js";

export type GateItemStatus =
  | "PASS"
  | "FAIL"
  | "PARTIAL"
  | "PENDING"
  | "BLOCKED"
  | "NOT_CLAIMED"
  | "NOT_MEASURED";

export interface GateChecklistItem {
  id: string;
  title: string;
  status: GateItemStatus;
  evidence: string;
  mergeBlocking: boolean;
}

export interface ReleaseGateChecklist {
  generatedAt: string;
  sutMode: SutMode;
  subsetPath: string;
  subsetCaseCount: number;
  rankingPasses: number;
  blockingFailureCount: number;
  items: GateChecklistItem[];
}

/**
 * Step 3 Phase 9 — 20 release gates measurable from the QA/orchestrator brief.
 * Fly-deploy gates are BLOCKED/PENDING with reason; Google comparison is NOT_CLAIMED.
 * Exit nonzero is driven only by merge-blocking benchmark failures (see gate.ts).
 */
export function buildReleaseChecklist(args: {
  generatedAt: string;
  sutMode: SutMode;
  subsetPath: string;
  subsetCaseCount: number;
  rankingPasses: number;
  blockingFailures: string[];
  configFailures: string[];
  report: BenchmarkReport;
  shadowReportPath?: string | null;
}): ReleaseGateChecklist {
  const {
    generatedAt,
    sutMode,
    subsetPath,
    subsetCaseCount,
    rankingPasses,
    blockingFailures,
    configFailures,
    report,
    shadowReportPath,
  } = args;

  const mergeOk =
    configFailures.length === 0 &&
    blockingFailures.length === 0 &&
    rankingPasses > 0;

  const topologyFails = report.cases.filter((c) =>
    c.assertions.some(
      (a) =>
        a.status === "fail" &&
        (a.invariantId === "valid_itinerary_structure" ||
          a.invariantId === "chronological_legs" ||
          a.invariantId === "nonnegative_durations")
    )
  ).length;

  const accountingFails = report.cases.filter((c) =>
    c.assertions.some(
      (a) => a.status === "fail" && a.invariantId === "satisfaction_accounting"
    )
  ).length;

  const honestyFails = report.cases.filter((c) =>
    c.assertions.some(
      (a) => a.status === "fail" && a.invariantId === "honest_data_mode"
    )
  ).length;

  const recordedCount = report.cases.filter(
    (c) => c.classification === "recorded_data"
  ).length;
  const liveCount = report.cases.filter(
    (c) => c.classification === "live"
  ).length;

  const items: GateChecklistItem[] = [
    {
      id: "G01",
      title: "Case schema validation (corpus loads)",
      status: configFailures.length ? "FAIL" : "PASS",
      evidence:
        configFailures.length === 0
          ? `${subsetCaseCount} release-subset cases loaded; corpus schema-valid`
          : configFailures.slice(0, 3).join("; "),
      mergeBlocking: true,
    },
    {
      id: "G02",
      title: "Release-subset merge-blocking invariants pass",
      status: mergeOk ? "PASS" : "FAIL",
      evidence: mergeOk
        ? `blockingFailures=0 rankingPasses=${rankingPasses}`
        : `blocking=${blockingFailures.length} config=${configFailures.length} rankingPasses=${rankingPasses}`,
      mergeBlocking: true,
    },
    {
      id: "G03",
      title: "Zero topology-invalid itineraries on release subset (D.1)",
      status: topologyFails === 0 ? "PASS" : "FAIL",
      evidence: `topology-related fail cases=${topologyFails}`,
      mergeBlocking: true,
    },
    {
      id: "G04",
      title: "Zero selected-line accounting errors on release subset (D.2)",
      status: accountingFails === 0 ? "PASS" : "FAIL",
      evidence: `satisfaction_accounting fail cases=${accountingFails}`,
      mergeBlocking: true,
    },
    {
      id: "G05",
      title: "Ranking coverage (complete≻partial / max-sat-before-time)",
      status: rankingPasses > 0 ? "PASS" : "FAIL",
      evidence: `rankingPasses=${rankingPasses}`,
      mergeBlocking: true,
    },
    {
      id: "G06",
      title: "Deterministic fingerprint order on subset",
      status: report.cases.some((c) =>
        c.assertions.some(
          (a) => a.invariantId === "deterministic_order" && a.status === "fail"
        )
      )
        ? "FAIL"
        : "PASS",
      evidence: "deterministic_order assertions on release subset",
      mergeBlocking: true,
    },
    {
      id: "G07",
      title: "Honest dataMode labeling (B.1 / B.2)",
      status: honestyFails === 0 ? "PASS" : "FAIL",
      evidence: `honest_data_mode fail cases=${honestyFails}`,
      mergeBlocking: true,
    },
    {
      id: "G08",
      title: "Negative self-test harness (expected fails fire)",
      status: "PENDING",
      evidence:
        "Run separately: npm --prefix benchmarks/runner run self-test (not re-executed inside gate)",
      mergeBlocking: false,
    },
    {
      id: "G09",
      title: "Recorded live NYC responses in corpus",
      status: recordedCount > 0 ? "PASS" : "PENDING",
      evidence: `recorded_data cases in this run=${recordedCount}`,
      mergeBlocking: false,
    },
    {
      id: "G10",
      title: "Live HTTP SUT adapter available",
      status: "PASS",
      evidence:
        sutMode === "live"
          ? `Executed with BETTERMTA_SUT=live${shadowReportPath ? `; shadow=${shadowReportPath}` : ""}`
          : "Adapter present (benchmarks/runner/src/sut-live.ts); this gate run used fixture SUT",
      mergeBlocking: false,
    },
    {
      id: "G11",
      title: "Live smoke cases executable when API up",
      status:
        sutMode === "live"
          ? liveCount > 0
            ? "PASS"
            : "PARTIAL"
          : liveCount > 0
            ? "PENDING"
            : "PENDING",
      evidence:
        sutMode === "live"
          ? `live classification cases executed=${liveCount}`
          : "Requires BETTERMTA_SUT=live and reachable API (:8080 compose or :3080 host)",
      mergeBlocking: false,
    },
    {
      id: "G12",
      title: "Shadow benchmark report written for live runs",
      status:
        sutMode === "live"
          ? shadowReportPath
            ? "PASS"
            : "PARTIAL"
          : "PENDING",
      evidence: shadowReportPath
        ? shadowReportPath
        : "Only emitted when BETTERMTA_SUT=live hits HTTP cases",
      mergeBlocking: false,
    },
    {
      id: "G13",
      title: "Core workflow accessibility (D.3)",
      status: "NOT_MEASURED",
      evidence:
        "ACCEPTANCE_CRITERIA §D.3 owned by Frontend — not measured by this gate",
      mergeBlocking: false,
    },
    {
      id: "G14",
      title: "CI unit/lint/typecheck/build (D.4)",
      status: "PARTIAL",
      evidence:
        "Infra CI validates contracts + directory-guarded jobs; full app CI additive — see infra handoff",
      mergeBlocking: false,
    },
    {
      id: "G15",
      title: "Route search p95 < 2.0s under beta load (C.4)",
      status: "NOT_MEASURED",
      evidence:
        "Latency captured in live shadow reports per-case; load-test p95 owned by Integration/Infra",
      mergeBlocking: false,
    },
    {
      id: "G16",
      title: "Health live/ready + locked endpoints (C.1 / C.3)",
      status: "PARTIAL",
      evidence:
        "Local compose/host stack proven in integration; not re-probed by this gate process",
      mergeBlocking: false,
    },
    {
      id: "G17",
      title: "Fly.io cloud deploy activated (E ops)",
      status: "BLOCKED",
      evidence:
        "No flyctl auth / Fly apps — prepared TOML only (infra Phase 8). Not a merge-blocking QA failure.",
      mergeBlocking: false,
    },
    {
      id: "G18",
      title: "One-action rollback drill tested (E.4)",
      status: "PENDING",
      evidence:
        "Blocked on Fly activation; procedure documented in infra/fly/DEPLOY.md",
      mergeBlocking: false,
    },
    {
      id: "G19",
      title: "Production alerts + rate limits (E.3 / E.5)",
      status: "PENDING",
      evidence: "Infra prepared; cloud activation pending — not merge-blocking here",
      mergeBlocking: false,
    },
    {
      id: "G20",
      title: "Google/Apple/Citymapper superiority comparison (H.1)",
      status: "NOT_CLAIMED",
      evidence:
        "No automated third-party scrape; external comparison remains manual-only. Never claim beats Google without QA evidence.",
      mergeBlocking: false,
    },
  ];

  return {
    generatedAt,
    sutMode,
    subsetPath,
    subsetCaseCount,
    rankingPasses,
    blockingFailureCount: blockingFailures.length + configFailures.length,
    items,
  };
}

export function formatReleaseChecklistMarkdown(
  checklist: ReleaseGateChecklist
): string {
  const lines: string[] = [];
  lines.push("# BetterMTA Release Gate Checklist");
  lines.push("");
  lines.push(`- Generated: ${checklist.generatedAt}`);
  lines.push(`- SUT mode: \`${checklist.sutMode}\``);
  lines.push(
    `- Release subset: \`${checklist.subsetPath}\` (${checklist.subsetCaseCount} cases)`
  );
  lines.push(`- Ranking passes: ${checklist.rankingPasses}`);
  lines.push(
    `- Merge-blocking failures: ${checklist.blockingFailureCount}`
  );
  lines.push("");
  lines.push(
    "Exit code of `npm run gate` is driven only by merge-blocking benchmark failures (G01–G07). Fly BLOCKED / Google NOT_CLAIMED do **not** fail the gate alone."
  );
  lines.push("");
  lines.push("| ID | Status | Merge-blocking | Gate | Evidence |");
  lines.push("|---|---|---|---|---|");
  for (const item of checklist.items) {
    lines.push(
      `| ${item.id} | ${item.status} | ${item.mergeBlocking ? "yes" : "no"} | ${item.title} | ${item.evidence.replace(/\|/g, "\\|")} |`
    );
  }
  lines.push("");
  lines.push("## Status legend");
  lines.push("");
  lines.push(
    "`PASS` · `FAIL` · `PARTIAL` · `PENDING` · `BLOCKED` · `NOT_CLAIMED` · `NOT_MEASURED`"
  );
  lines.push("");
  return lines.join("\n");
}

export async function writeReleaseChecklist(
  outDir: string,
  checklist: ReleaseGateChecklist
): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const stamp = checklist.generatedAt.replace(/[:.]/g, "-");
  const mdPath = path.join(outDir, `release-gate-${stamp}.md`);
  await writeFile(mdPath, formatReleaseChecklistMarkdown(checklist));
  const latest = path.join(outDir, "release-gate-latest.md");
  await writeFile(latest, formatReleaseChecklistMarkdown(checklist));
  return mdPath;
}
