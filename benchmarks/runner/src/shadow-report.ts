import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  BenchmarkCase,
  RouteSearchRequest,
  RouteSearchResponse,
} from "./types.js";

export type HumanValidity = "pending_review" | "accepted" | "rejected";

export interface ShadowCaseEntry {
  caseId: string;
  title: string;
  classification: string;
  origin: RouteSearchRequest["origin"];
  destination: RouteSearchRequest["destination"];
  selectedLineIds: string[];
  timing: RouteSearchRequest["timing"];
  staticDatasetVersion: string;
  realtimeSnapshotId: string | null;
  dataMode: string;
  latencyMs: number;
  satisfactionSummary: RouteSearchResponse["constrained"]["satisfactionSummary"];
  constrainedItineraries: Array<{
    itineraryId: string;
    lineSequence: string[];
    arrivalTime: string;
    durationSeconds: number;
    satisfactionCount: number;
    feasibility: string;
    omittedLineIds: string[];
  }>;
  baselineCount: number;
  humanValidity: HumanValidity;
  error?: string;
}

export interface ShadowReport {
  generatedAt: string;
  sutName: string;
  apiBase: string;
  humanValidityDefault: HumanValidity;
  cases: ShadowCaseEntry[];
}

export function buildShadowEntry(args: {
  benchmarkCase: BenchmarkCase;
  request: RouteSearchRequest;
  response?: RouteSearchResponse;
  latencyMs: number;
  error?: string;
  humanValidity?: HumanValidity;
}): ShadowCaseEntry {
  const { benchmarkCase: c, request, response, latencyMs, error } = args;
  const humanValidity = args.humanValidity ?? "pending_review";
  if (!response) {
    return {
      caseId: c.caseId,
      title: c.title,
      classification: c.classification,
      origin: request.origin,
      destination: request.destination,
      selectedLineIds: request.selectedLineIds ?? [],
      timing: request.timing,
      staticDatasetVersion: c.staticDatasetVersion,
      realtimeSnapshotId: null,
      dataMode: "unavailable",
      latencyMs,
      satisfactionSummary: {
        bestSatisfactionCount: 0,
        requestedCount: (request.selectedLineIds ?? []).length,
        completeMatchFound: false,
      },
      constrainedItineraries: [],
      baselineCount: 0,
      humanValidity,
      error,
    };
  }

  return {
    caseId: c.caseId,
    title: c.title,
    classification: c.classification,
    origin: request.origin,
    destination: request.destination,
    selectedLineIds: request.selectedLineIds ?? [],
    timing: request.timing,
    staticDatasetVersion: response.staticDatasetVersion,
    realtimeSnapshotId: response.realtimeSnapshotId ?? null,
    dataMode: response.dataMode,
    latencyMs,
    satisfactionSummary: response.constrained.satisfactionSummary,
    constrainedItineraries: response.constrained.itineraries.map((itin) => ({
      itineraryId: itin.itineraryId,
      lineSequence: itin.lineSequence,
      arrivalTime: itin.arrivalTime,
      durationSeconds: itin.durationSeconds,
      satisfactionCount: itin.satisfaction.satisfactionCount,
      feasibility: itin.satisfaction.feasibility,
      omittedLineIds: itin.satisfaction.omittedLineIds,
    })),
    baselineCount: response.baseline.itineraries.length,
    humanValidity,
    error,
  };
}

export function formatShadowHuman(report: ShadowReport): string {
  const lines: string[] = [];
  lines.push("BetterMTA Live Shadow Benchmark Report");
  lines.push(`SUT: ${report.sutName}`);
  lines.push(`API: ${report.apiBase}`);
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`humanValidity default: ${report.humanValidityDefault}`);
  lines.push("");
  for (const c of report.cases) {
    lines.push(`## ${c.caseId} — ${c.title}`);
    lines.push(
      `OD: ${JSON.stringify(c.origin)} → ${JSON.stringify(c.destination)}`
    );
    lines.push(`Lines: [${c.selectedLineIds.join(", ")}]  timing=${JSON.stringify(c.timing)}`);
    lines.push(
      `Versions: static=${c.staticDatasetVersion} realtime=${c.realtimeSnapshotId ?? "null"} dataMode=${c.dataMode}`
    );
    lines.push(`Latency: ${c.latencyMs}ms`);
    lines.push(
      `Satisfaction: best=${c.satisfactionSummary.bestSatisfactionCount}/${c.satisfactionSummary.requestedCount} complete=${c.satisfactionSummary.completeMatchFound}`
    );
    lines.push(
      `Itineraries: constrained=${c.constrainedItineraries.length} baseline=${c.baselineCount}`
    );
    for (const itin of c.constrainedItineraries) {
      lines.push(
        `  - ${itin.itineraryId}: ${itin.lineSequence.join("→")} arr=${itin.arrivalTime} sat=${itin.satisfactionCount} feas=${itin.feasibility} omitted=[${itin.omittedLineIds.join(",")}]`
      );
    }
    lines.push(`humanValidity: ${c.humanValidity}`);
    if (c.error) lines.push(`ERROR: ${c.error}`);
    lines.push("");
  }
  return lines.join("\n");
}

export async function writeShadowReport(
  outDir: string,
  report: ShadowReport
): Promise<{ jsonPath: string; txtPath: string }> {
  await mkdir(outDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `live-shadow-${stamp}.json`);
  const txtPath = path.join(outDir, `live-shadow-${stamp}.txt`);
  await writeFile(jsonPath, JSON.stringify(report, null, 2) + "\n");
  await writeFile(txtPath, formatShadowHuman(report) + "\n");
  return { jsonPath, txtPath };
}
