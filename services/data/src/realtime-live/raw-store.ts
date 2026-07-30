/**
 * Per-feed raw protobuf last-known-good store (memory + optional disk mirror).
 * Empty / failed polls must not displace a usable prior LKG.
 */

import { mkdirSync, renameSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

export interface RawFeedLkg {
  feedId: string;
  bytes: Buffer;
  fetchedAt: string;
  headerTimestamp: number;
  byteSize: number;
}

export class RawFeedStore {
  private readonly memory = new Map<string, RawFeedLkg>();

  constructor(
    private readonly options: {
      dataDir: string;
      mirrorToDisk: boolean;
    },
  ) {}

  get(feedId: string): RawFeedLkg | null {
    return this.memory.get(feedId) ?? null;
  }

  list(): RawFeedLkg[] {
    return [...this.memory.values()];
  }

  /**
   * Store a successful fetch. Always updates memory; optionally mirrors to disk.
   * Callers must not invoke this for hollow/failed polls when preserving LKG —
   * the poller only calls put on decode success.
   */
  put(entry: RawFeedLkg): void {
    this.memory.set(entry.feedId, entry);
    if (this.options.mirrorToDisk) {
      this.mirror(entry);
    }
  }

  private mirror(entry: RawFeedLkg): void {
    const dir = join(this.options.dataDir, "realtime", "raw");
    mkdirSync(dir, { recursive: true });
    const target = join(dir, `${entry.feedId}.pb`);
    const tmp = join(dir, `.${entry.feedId}.${process.pid}.tmp`);
    const metaTarget = join(dir, `${entry.feedId}.meta.json`);
    const metaTmp = join(dir, `.${entry.feedId}.meta.${process.pid}.tmp`);
    writeFileSync(tmp, entry.bytes);
    renameSync(tmp, target);
    writeFileSync(
      metaTmp,
      JSON.stringify({
        feedId: entry.feedId,
        fetchedAt: entry.fetchedAt,
        headerTimestamp: entry.headerTimestamp,
        byteSize: entry.byteSize,
      }),
    );
    renameSync(metaTmp, metaTarget);
  }

  /** Load any on-disk mirrors into memory (startup). */
  loadFromDisk(feedIds: string[]): void {
    if (!this.options.mirrorToDisk) return;
    const dir = join(this.options.dataDir, "realtime", "raw");
    for (const feedId of feedIds) {
      const pb = join(dir, `${feedId}.pb`);
      const meta = join(dir, `${feedId}.meta.json`);
      if (!existsSync(pb) || !existsSync(meta)) continue;
      try {
        const bytes = readFileSync(pb);
        const m = JSON.parse(readFileSync(meta, "utf8")) as {
          fetchedAt: string;
          headerTimestamp: number;
          byteSize: number;
        };
        this.memory.set(feedId, {
          feedId,
          bytes,
          fetchedAt: m.fetchedAt,
          headerTimestamp: m.headerTimestamp,
          byteSize: m.byteSize ?? bytes.length,
        });
      } catch {
        // ignore corrupt mirrors
      }
    }
  }
}

export function rawDiskPath(dataDir: string, feedId: string): string {
  return join(dataDir, "realtime", "raw", `${feedId}.pb`);
}

void dirname;
