import type { LatencySnapshot } from "./latency.js";
import type { PrivacyMetricsSnapshot } from "./privacyMetrics.js";

function quoteLabel(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"')}"`;
}

function prometheusCounterKey(key: string): string {
  const match = /^([^{}]+)(?:\{([^{}]*)\})?$/.exec(key);
  if (!match?.[2]) return match?.[1] ?? key;
  const labels = match[2]
    .split(",")
    .map((entry) => {
      const separator = entry.indexOf("=");
      if (separator < 1) return null;
      return `${entry.slice(0, separator)}=${quoteLabel(entry.slice(separator + 1))}`;
    })
    .filter((entry): entry is string => entry !== null);
  return `${match[1]}{${labels.join(",")}}`;
}

function appendHistogram(
  lines: string[],
  name: string,
  snapshot: LatencySnapshot,
): void {
  lines.push(`# TYPE ${name} histogram`);
  let cumulative = 0;
  for (let i = 0; i < snapshot.bucketCounts.length; i++) {
    cumulative += snapshot.bucketCounts[i] ?? 0;
    const bound = snapshot.bucketBoundsMs[i];
    const le = bound === undefined ? "+Inf" : String(bound / 1000);
    lines.push(`${name}_bucket{le=${quoteLabel(le)}} ${cumulative}`);
  }
  lines.push(`${name}_sum ${snapshot.sumMs / 1000}`);
  lines.push(`${name}_count ${snapshot.count}`);
}

/** Render only bounded operational aggregates; no queries, coordinates, or IDs. */
export function renderPrometheusMetrics(input: {
  requestLatency: LatencySnapshot;
  privacy: PrivacyMetricsSnapshot;
}): string {
  const lines: string[] = [];
  const counters = {
    ...input.privacy.placeProvider.totals,
    ...input.privacy.candidateBudget.totals,
    ...input.privacy.preferenceCoverage.totals,
  };
  for (const [key, value] of Object.entries(counters).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    lines.push(`${prometheusCounterKey(key)} ${value}`);
  }
  appendHistogram(
    lines,
    "bettermta_api_request_duration_seconds",
    input.requestLatency,
  );
  appendHistogram(
    lines,
    "bettermta_place_provider_duration_seconds",
    input.privacy.placeProvider.latency,
  );
  return `${lines.join("\n")}\n`;
}
