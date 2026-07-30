/**
 * Per-feed GTFS-RT poller with timeout, size cap, retries, jitter, and LKG.
 */

import type { StaticDataset } from "../types.js";
import type { ParsedRealtimeFeed } from "../realtime/parser.js";
import {
  REALTIME_FEEDS,
  feedUrl,
  type RealtimeFeedDef,
} from "./feeds.js";
import {
  loadRealtimeLiveConfig,
  pollIntervalForFeed,
  type RealtimeLiveConfig,
} from "./config.js";
import { decodeFeedMessage, ProtoDecodeError } from "./proto.js";
import { normalizeDecodedFeed } from "./normalize.js";
import { RawFeedStore, type RawFeedLkg } from "./raw-store.js";
import {
  assembleLiveSnapshot,
  SnapshotManifestStore,
  type AssembledFeedInput,
} from "./snapshot-assembly.js";
import type { RealtimeIngestor } from "../realtime/ingest.js";
import type { SnapshotManifest, RealtimeSnapshot } from "../types.js";
import { safeLog } from "./log.js";

export interface PollerDeps {
  config?: RealtimeLiveConfig;
  rawStore: RawFeedStore;
  ingestor: RealtimeIngestor;
  manifestStore: SnapshotManifestStore;
  getStaticDataset: () => StaticDataset | null;
  /** Injectable fetch for tests */
  fetchFn?: typeof fetch;
  /** Injectable clock */
  nowFn?: () => number;
  /** Called after each full assembly attempt */
  onSnapshot?: (snapshot: RealtimeSnapshot, manifest: SnapshotManifest) => void;
}

export interface FeedPollState {
  feedId: string;
  lastError?: string;
  lastSuccessAt?: string;
  running: boolean;
  consecutiveFailures: number;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function jitter(ms: number, spread = 0.2): number {
  const delta = ms * spread * (Math.random() * 2 - 1);
  return Math.max(0, Math.floor(ms + delta));
}

export class RealtimePoller {
  private readonly config: RealtimeLiveConfig;
  private readonly fetchFn: typeof fetch;
  private readonly nowFn: () => number;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly abortByFeed = new Map<string, AbortController>();
  private readonly state = new Map<string, FeedPollState>();
  private readonly latestParsed = new Map<string, AssembledFeedInput>();
  private stopped = false;
  private gatewayAbort: AbortController | null = null;
  private assemblyTimer: ReturnType<typeof setTimeout> | null = null;
  private latestSnapshot: RealtimeSnapshot | null = null;
  private latestManifest: SnapshotManifest | null = null;

  constructor(private readonly deps: PollerDeps) {
    this.config = deps.config ?? loadRealtimeLiveConfig();
    this.fetchFn = deps.fetchFn ?? fetch;
    this.nowFn = deps.nowFn ?? (() => Date.now());
    for (const f of REALTIME_FEEDS) {
      this.state.set(f.feedId, {
        feedId: f.feedId,
        running: false,
        consecutiveFailures: 0,
      });
    }
  }

  getRawStore(): RawFeedStore {
    return this.deps.rawStore;
  }

  getLatestSnapshot(): RealtimeSnapshot | null {
    return this.latestSnapshot;
  }

  getLatestManifest(): SnapshotManifest | null {
    return this.latestManifest ?? this.deps.manifestStore.latest();
  }

  getFeedStates(): FeedPollState[] {
    return [...this.state.values()];
  }

  start(): void {
    if (this.stopped) this.stopped = false;
    this.gatewayAbort = new AbortController();
    // Stagger start offsets across feeds
    REALTIME_FEEDS.forEach((feed, index) => {
      const offset = Math.floor(
        (pollIntervalForFeed(this.config, feed.feedId) / REALTIME_FEEDS.length) *
          index +
          Math.random() * 500,
      );
      const timer = setTimeout(() => {
        void this.loopFeed(feed);
      }, offset);
      this.timers.set(`start:${feed.feedId}`, timer);
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.gatewayAbort?.abort();
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    if (this.assemblyTimer) clearTimeout(this.assemblyTimer);
    for (const ac of this.abortByFeed.values()) ac.abort();
    this.abortByFeed.clear();
    // Brief yield so in-flight catches settle
    await sleep(10);
  }

  /** Run a single poll cycle for all feeds (tests / live integration). */
  async pollAllOnce(): Promise<{
    snapshot: RealtimeSnapshot | null;
    manifest: SnapshotManifest | null;
    results: AssembledFeedInput[];
  }> {
    const results: AssembledFeedInput[] = [];
    for (const feed of REALTIME_FEEDS) {
      const r = await this.pollOne(feed);
      results.push(r);
      this.latestParsed.set(feed.feedId, r);
    }
    const assembled = this.assembleFromLatest();
    return {
      snapshot: assembled?.snapshot ?? null,
      manifest: assembled?.manifest ?? null,
      results,
    };
  }

  private async loopFeed(feed: RealtimeFeedDef): Promise<void> {
    while (!this.stopped) {
      const started = this.nowFn();
      try {
        const result = await this.pollOne(feed);
        this.latestParsed.set(feed.feedId, result);
        this.scheduleAssembly();
      } catch (err) {
        if (!this.stopped) {
          safeLog("warn", "poll_loop_error", {
            feedId: feed.feedId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      const elapsed = this.nowFn() - started;
      const interval = pollIntervalForFeed(this.config, feed.feedId);
      const wait = Math.max(0, jitter(interval) - elapsed);
      try {
        await sleep(wait, this.gatewayAbort?.signal);
      } catch {
        break;
      }
    }
  }

  async pollOne(feed: RealtimeFeedDef): Promise<AssembledFeedInput> {
    const st = this.state.get(feed.feedId)!;
    st.running = true;
    const prior = this.deps.rawStore.get(feed.feedId);
    const ac = new AbortController();
    this.abortByFeed.set(feed.feedId, ac);

    try {
      const bytes = await this.fetchWithRetries(feed, ac.signal);
      const fetchedAt = new Date(this.nowFn()).toISOString();
      const decoded = await decodeFeedMessage(bytes, { nowMs: this.nowFn() });
      const staticDataset = this.deps.getStaticDataset();
      const knownTripIds = staticDataset
        ? new Set(staticDataset.trips.map((t) => t.tripId))
        : undefined;
      const parsed = normalizeDecodedFeed(decoded, {
        feedId: feed.feedId,
        lineMapping: staticDataset?.lineMapping,
        knownTripIds,
        staticDataset,
        nowMs: this.nowFn(),
      });

      const lkg: RawFeedLkg = {
        feedId: feed.feedId,
        bytes: Buffer.from(bytes),
        fetchedAt,
        headerTimestamp: decoded.header.timestamp,
        byteSize: bytes.byteLength,
      };
      // Always store successful decode as raw LKG (even if hollow — raw bytes
      // are still the latest wire capture for OTP updaters). Snapshot LKG
      // usability is enforced separately in ingest.
      this.deps.rawStore.put(lkg);

      st.lastSuccessAt = fetchedAt;
      st.lastError = undefined;
      st.consecutiveFailures = 0;

      return {
        feedId: feed.feedId,
        parsed,
        fetchedAt,
        headerTimestamp: decoded.header.timestamp,
      };
    } catch (err) {
      const reason =
        err instanceof ProtoDecodeError
          ? err.code
          : err instanceof Error
            ? err.message
            : String(err);
      st.lastError = reason;
      st.consecutiveFailures += 1;
      safeLog("warn", "feed_poll_failed", {
        feedId: feed.feedId,
        reason,
        consecutiveFailures: st.consecutiveFailures,
      });

      // Keep prior raw LKG; surface status from LKG ages when available
      if (prior) {
        let parsed: ParsedRealtimeFeed | null = null;
        try {
          const decoded = await decodeFeedMessage(prior.bytes, {
            nowMs: this.nowFn(),
          });
          const staticDataset = this.deps.getStaticDataset();
          parsed = normalizeDecodedFeed(decoded, {
            feedId: feed.feedId,
            lineMapping: staticDataset?.lineMapping,
            knownTripIds: staticDataset
              ? new Set(staticDataset.trips.map((t) => t.tripId))
              : undefined,
            staticDataset,
            nowMs: this.nowFn(),
          });
        } catch {
          parsed = null;
        }
        return {
          feedId: feed.feedId,
          parsed,
          fetchedAt: prior.fetchedAt,
          headerTimestamp: prior.headerTimestamp,
          error: reason,
          fromLkg: true,
        };
      }
      return {
        feedId: feed.feedId,
        parsed: null,
        fetchedAt: null,
        headerTimestamp: null,
        error: reason,
      };
    } finally {
      st.running = false;
      this.abortByFeed.delete(feed.feedId);
    }
  }

  private async fetchWithRetries(
    feed: RealtimeFeedDef,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    const url = feedUrl(feed, this.config.baseUrl);
    let lastErr: unknown;
    const attempts = 1 + this.config.maxRetries;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (signal.aborted || this.stopped) {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      }
      try {
        return await this.fetchOnce(url, signal);
      } catch (err) {
        lastErr = err;
        if (attempt + 1 >= attempts) break;
        const backoff = jitter(Math.min(5000, 200 * 2 ** attempt));
        try {
          await sleep(backoff, signal);
        } catch {
          throw err;
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  private async fetchOnce(
    url: string,
    parentSignal: AbortSignal,
  ): Promise<Uint8Array> {
    const timeoutAc = new AbortController();
    const timer = setTimeout(
      () => timeoutAc.abort(),
      this.config.timeoutMs,
    );
    const onParent = () => timeoutAc.abort();
    parentSignal.addEventListener("abort", onParent, { once: true });
    try {
      const res = await this.fetchFn(url, {
        signal: timeoutAc.signal,
        headers: { Accept: "application/x-protobuf, application/octet-stream" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) {
        const ab = await res.arrayBuffer();
        if (ab.byteLength > this.config.maxBytes) {
          throw new Error(`response_too_large:${ab.byteLength}`);
        }
        return new Uint8Array(ab);
      }
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > this.config.maxBytes) {
            await reader.cancel();
            throw new Error(`response_too_large:${total}`);
          }
          chunks.push(value);
        }
      }
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.byteLength;
      }
      return out;
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === "AbortError" || timeoutAc.signal.aborted)
      ) {
        throw new Error("timeout");
      }
      throw err;
    } finally {
      clearTimeout(timer);
      parentSignal.removeEventListener("abort", onParent);
    }
  }

  private scheduleAssembly(): void {
    if (this.assemblyTimer) return;
    this.assemblyTimer = setTimeout(() => {
      this.assemblyTimer = null;
      this.assembleFromLatest();
    }, 50);
  }

  private assembleFromLatest(): {
    snapshot: RealtimeSnapshot;
    manifest: SnapshotManifest;
  } | null {
    const feeds = REALTIME_FEEDS.map((f) => {
      return (
        this.latestParsed.get(f.feedId) ?? {
          feedId: f.feedId,
          parsed: null,
          fetchedAt: null,
          headerTimestamp: null,
        }
      );
    });
    if (feeds.every((f) => !f.parsed && !f.error && !f.fromLkg)) {
      return null;
    }
    const staticDataset = this.deps.getStaticDataset();
    const { snapshot, manifest } = assembleLiveSnapshot({
      ingestor: this.deps.ingestor,
      feeds,
      staticDatasetVersion: staticDataset?.staticDatasetVersion ?? null,
      knownTripIds: staticDataset
        ? new Set(staticDataset.trips.map((t) => t.tripId))
        : undefined,
      lineMapping: staticDataset?.lineMapping,
      nowMs: this.nowFn(),
      synthetic: false,
    });
    this.deps.manifestStore.put(manifest, this.nowFn());
    this.latestSnapshot = snapshot;
    this.latestManifest = manifest;
    this.deps.onSnapshot?.(snapshot, manifest);
    return { snapshot, manifest };
  }
}
