/**
 * Offline ranking micro-benchmark for ROUTING_ENGINE_SPEC.md.
 * Usage: npm run bench:rank
 */
import { performance } from "node:perf_hooks";
import {
  enrichCandidate,
  rankConstrained,
  truncateTop,
} from "../src/index.ts";
import type { Itinerary } from "../src/index.ts";

function buildCandidates(n: number): Itinerary[] {
  return Array.from({ length: n }, (_, i) => {
    const satisfactionCount = i % 6;
    return enrichCandidate(
      {
        itineraryId: `bench_${i}`,
        durationSeconds: 1000 + (i % 50),
        arrivalTime: new Date(
          Date.parse("2026-07-30T14:00:00.000Z") + i * 1000,
        ).toISOString(),
        walkingSeconds: i % 400,
        waitingSeconds: i % 200,
        transferCount: i % 4,
        realtimeConfidence: (["high", "medium", "low", "none"] as const)[i % 4]!,
        candidateFamily: "constrained",
        legs: [
          {
            legId: `t_${i}`,
            kind: "transit",
            lineId: ["A", "B", "C", "D", "E", "F"][satisfactionCount] ?? "A",
            from: { name: "O" },
            to: { name: "D" },
            departTime: "2026-07-30T13:50:00.000Z",
            arriveTime: new Date(
              Date.parse("2026-07-30T14:00:00.000Z") + i * 1000,
            ).toISOString(),
          },
        ],
      },
      ["A", "B", "C", "D", "E"],
      null,
    );
  });
}

const n = 1000;
const candidates = buildCandidates(n);
const iterations = 50;
let total = 0;
for (let i = 0; i < iterations; i++) {
  const t0 = performance.now();
  truncateTop(rankConstrained(candidates), 3);
  total += performance.now() - t0;
}
const avg = total / iterations;
console.log(
  JSON.stringify({
    operation: "rankConstrained+truncateTop3",
    candidates: n,
    iterations,
    avgMs: Number(avg.toFixed(3)),
    dataMode: "synthetic",
  }),
);
