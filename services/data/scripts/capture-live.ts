/**
 * Capture live MTA GTFS-RT feeds once for offline regression fixtures.
 *
 * Usage: npx tsx scripts/capture-live.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REALTIME_FEEDS,
  feedUrl,
  MTA_GTFS_RT_BASE,
} from "../src/realtime-live/feeds.js";
import { decodeFeedMessage } from "../src/realtime-live/proto.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "fixtures", "realtime-pb", "captured");

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const capturedAt = new Date().toISOString();
  const feeds: Array<Record<string, unknown>> = [];

  for (const feed of REALTIME_FEEDS) {
    const url = feedUrl(feed, MTA_GTFS_RT_BASE);
    const started = Date.now();
    const res = await fetch(url, {
      headers: { Accept: "application/x-protobuf" },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const elapsedMs = Date.now() - started;
    const outPath = join(OUT_DIR, `${feed.feedId}.pb`);
    writeFileSync(outPath, buf);

    let headerTimestamp: number | null = null;
    let entityCount = 0;
    let nyctVersion: string | null = null;
    let replacementPeriodCount = 0;
    let decodeError: string | null = null;
    try {
      const decoded = await decodeFeedMessage(buf);
      headerTimestamp = decoded.header.timestamp;
      entityCount = decoded.entity.length;
      nyctVersion = decoded.header.nyct?.nyctSubwayVersion ?? null;
      replacementPeriodCount =
        decoded.header.nyct?.tripReplacementPeriods.length ?? 0;
    } catch (err) {
      decodeError = err instanceof Error ? err.message : String(err);
    }

    const entry = {
      feedId: feed.feedId,
      url,
      httpStatus: res.status,
      byteSize: buf.length,
      elapsedMs,
      headerTimestamp,
      headerTimestampIso: headerTimestamp
        ? new Date(headerTimestamp * 1000).toISOString()
        : null,
      headerAgeSeconds: headerTimestamp
        ? Math.floor(Date.now() / 1000 - headerTimestamp)
        : null,
      entityCount,
      nyctSubwayVersion: nyctVersion,
      tripReplacementPeriodCount: replacementPeriodCount,
      decodeError,
      path: `fixtures/realtime-pb/captured/${feed.feedId}.pb`,
    };
    feeds.push(entry);
    console.log(
      JSON.stringify({
        feedId: entry.feedId,
        byteSize: entry.byteSize,
        entities: entry.entityCount,
        age: entry.headerAgeSeconds,
        trp: entry.tripReplacementPeriodCount,
        err: entry.decodeError,
      }),
    );
  }

  const manifest = {
    capturedAt,
    baseUrl: MTA_GTFS_RT_BASE,
    feeds,
  };
  writeFileSync(
    join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`Wrote ${feeds.length} feeds + manifest to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
