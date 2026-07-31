import type { Place } from "../../types.js";
import type { Logger } from "../../logging/logger.js";
import { placeIdForGeocode } from "./placeId.js";
import {
  GEOCODER_PROVIDER_ID,
  type GeocodeSearchInput,
  type GeocodeSearchResult,
  type GeocoderProvider,
} from "./types.js";

export interface NominatimGeocoderOptions {
  baseUrl: string;
  /** Required by Nominatim usage policy — identify the application. */
  userAgent: string;
  /** Optional contact email appended to User-Agent. */
  email?: string | null;
  timeoutMs: number;
  /** Max attempts including the first try (bounded retries). */
  maxAttempts: number;
  /** Minimum interval between outbound Nominatim calls (public instance: 1 rps). */
  minIntervalMs: number;
  /** NYC-ish viewbox: left,top,right,bottom */
  viewbox?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  logger?: Logger;
  attribution?: string;
}

type NominatimHit = {
  place_id?: number | string;
  osm_type?: string;
  osm_id?: number | string;
  display_name?: string;
  lat?: string;
  lon?: string;
  class?: string;
  type?: string;
  name?: string;
  importance?: number;
  address?: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
};

const DEFAULT_ATTRIBUTION =
  "© OpenStreetMap contributors" as const;

const NYC_VIEWBOX = "-74.28,40.92,-73.68,40.48";

/**
 * OpenStreetMap Nominatim adapter for controlled alpha.
 * Secrets/credentials: none required for the public instance; User-Agent is mandatory.
 * Prefer a self-hosted or LocationIQ-compatible Nominatim URL via BETTERMTA_NOMINATIM_BASE_URL
 * if public rate limits are too tight.
 */
export class NominatimGeocoderAdapter implements GeocoderProvider {
  readonly id = GEOCODER_PROVIDER_ID;

  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly email: string | null;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly minIntervalMs: number;
  private readonly viewbox: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly logger?: Logger;
  private readonly attribution: string;
  private lastRequestAt = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(opts: NominatimGeocoderOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.userAgent = opts.userAgent;
    this.email = opts.email ?? null;
    this.timeoutMs = opts.timeoutMs;
    this.maxAttempts = Math.max(1, opts.maxAttempts);
    this.minIntervalMs = Math.max(0, opts.minIntervalMs);
    this.viewbox = opts.viewbox ?? NYC_VIEWBOX;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? (() => Date.now());
    this.sleep =
      opts.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.logger = opts.logger;
    this.attribution = opts.attribution ?? DEFAULT_ATTRIBUTION;
  }

  async search(input: GeocodeSearchInput): Promise<GeocodeSearchResult> {
    const q = input.query.trim();
    if (!q) return { availability: "empty", places: [] };

    // Serialize + pace outbound calls (public Nominatim: ~1 req/s).
    const run = this.chain.then(() => this.searchPaced(input));
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async searchPaced(
    input: GeocodeSearchInput,
  ): Promise<GeocodeSearchResult> {
    const wait = this.minIntervalMs - (this.now() - this.lastRequestAt);
    if (wait > 0) await this.sleep(wait);

    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        this.lastRequestAt = this.now();
        const hits = await this.fetchSearch(input);
        if (hits.length === 0) {
          return { availability: "empty", places: [] };
        }
        const places = hits
          .map((hit) => this.toPlace(hit))
          .filter((p): p is Place => p !== null)
          .slice(0, input.limit);
        if (places.length === 0) {
          return { availability: "empty", places: [] };
        }
        return {
          availability: "ok",
          attribution: this.attribution,
          places,
        };
      } catch (err) {
        lastError = err;
        const retryable = isRetryable(err);
        this.logger?.warn("geocode_attempt_failed", {
          attempt,
          maxAttempts: this.maxAttempts,
          retryable,
          // Never log query text or coordinates.
          errorCode: "geocode_upstream",
        });
        if (!retryable || attempt >= this.maxAttempts) break;
        await this.sleep(Math.min(500 * attempt, 1500));
      }
    }

    this.logger?.warn("geocode_unavailable", {
      errorCode: "geocode_unavailable",
      hadError: lastError !== undefined,
    });
    return { availability: "unavailable", places: [] };
  }

  private async fetchSearch(input: GeocodeSearchInput): Promise<NominatimHit[]> {
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set("q", input.query.trim());
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", String(Math.min(Math.max(input.limit, 1), 15)));
    url.searchParams.set("countrycodes", "us");
    url.searchParams.set("viewbox", this.viewbox);
    url.searchParams.set("bounded", "0");
    if (
      input.proximityLat !== undefined &&
      input.proximityLon !== undefined &&
      Number.isFinite(input.proximityLat) &&
      Number.isFinite(input.proximityLon)
    ) {
      // Nominatim has no explicit proximity; viewbox already biases NYC.
      void input.proximityLat;
      void input.proximityLon;
    }

    const ua =
      this.email && this.email.length > 0
        ? `${this.userAgent} (${this.email})`
        : this.userAgent;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    input.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const res = await this.fetchImpl(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": ua,
        },
        signal: controller.signal,
      });

      if (res.status === 429 || res.status >= 500) {
        const err = new Error(`nominatim_http_${res.status}`);
        (err as Error & { retryable?: boolean }).retryable = true;
        throw err;
      }
      if (!res.ok) {
        const err = new Error(`nominatim_http_${res.status}`);
        (err as Error & { retryable?: boolean }).retryable = false;
        throw err;
      }

      const body = (await res.json()) as unknown;
      if (!Array.isArray(body)) return [];
      return body as NominatimHit[];
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        const timeout = new Error("nominatim_timeout");
        (timeout as Error & { retryable?: boolean }).retryable = true;
        throw timeout;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
    }
  }

  private toPlace(hit: NominatimHit): Place | null {
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const osmKey =
      hit.osm_type && hit.osm_id !== undefined
        ? `${hit.osm_type}:${hit.osm_id}`
        : hit.place_id !== undefined
          ? `place:${hit.place_id}`
          : null;
    if (!osmKey) return null;

    const kind = classifyKind(hit);
    const formatted =
      typeof hit.display_name === "string" && hit.display_name.trim()
        ? hit.display_name.trim()
        : null;
    if (!formatted) return null;

    const label = labelFromHit(hit, formatted);

    return {
      placeId: placeIdForGeocode(osmKey),
      label,
      kind,
      lat,
      lon,
      provider: GEOCODER_PROVIDER_ID,
      providerPlaceId: osmKey,
      formattedAddress: formatted,
      attribution: this.attribution,
    };
  }
}

function classifyKind(hit: NominatimHit): "address" | "poi" {
  const cls = (hit.class ?? "").toLowerCase();
  const typ = (hit.type ?? "").toLowerCase();
  if (cls === "place" && (typ === "house" || typ === "address")) return "address";
  if (cls === "building" || cls === "highway" || typ === "house") return "address";
  if (hit.address?.house_number && hit.address?.road) return "address";
  if (cls === "amenity" || cls === "tourism" || cls === "shop" || cls === "office") {
    return "poi";
  }
  // Default: structured street address vs named POI.
  if (hit.address?.house_number) return "address";
  if (hit.name && hit.name.trim()) return "poi";
  return "address";
}

function labelFromHit(hit: NominatimHit, formatted: string): string {
  if (hit.name && hit.name.trim()) return hit.name.trim();
  const addr = hit.address;
  if (addr?.house_number && addr?.road) {
    return `${addr.house_number} ${addr.road}`;
  }
  if (addr?.road) return addr.road;
  // First comma-separated segment of display_name.
  const first = formatted.split(",")[0]?.trim();
  return first && first.length > 0 ? first : formatted;
}

function isRetryable(err: unknown): boolean {
  if (err && typeof err === "object" && "retryable" in err) {
    return Boolean((err as { retryable?: boolean }).retryable);
  }
  return true;
}
