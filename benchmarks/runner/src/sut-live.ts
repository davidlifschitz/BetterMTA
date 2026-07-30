import type {
  PlaceRef,
  RouteSearchRequest,
  RouteSearchResponse,
  SystemUnderTest,
} from "./types.js";

export interface LiveSutOptions {
  /** Base URL without trailing slash. Default from env or http://127.0.0.1:8080 */
  baseUrl?: string;
  /** Request timeout in ms. Default 30_000. */
  timeoutMs?: number;
}

export interface LiveSearchMeta {
  latencyMs: number;
  url: string;
  httpStatus: number;
}

/**
 * Live HTTP SystemUnderTest.
 * Calls POST {base}/v1/routes/search. Does not scrape third parties.
 * Fail-closed on network / non-2xx / invalid JSON.
 */
export class LiveSystemUnderTest implements SystemUnderTest {
  readonly name = "live-http-sut";
  readonly baseUrl: string;
  readonly timeoutMs: number;
  /** Per-search latency of the most recent successful or failed attempt. */
  lastMeta: LiveSearchMeta | null = null;
  /** Latencies for successful searches in this process (ms). */
  readonly latenciesMs: number[] = [];

  constructor(options: LiveSutOptions = {}) {
    const fromEnv = process.env.BETTERMTA_LIVE_API_BASE?.trim();
    this.baseUrl = (options.baseUrl ?? fromEnv ?? "http://127.0.0.1:8080").replace(
      /\/$/,
      ""
    );
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async search(request: RouteSearchRequest): Promise<RouteSearchResponse> {
    const url = `${this.baseUrl}/v1/routes/search`;
    const body = {
      origin: toLivePlaceRef(request.origin, "origin"),
      destination: toLivePlaceRef(request.destination, "destination"),
      timing: request.timing,
      selectedLineIds: request.selectedLineIds ?? [],
      clientContext: request.clientContext ?? {
        viewport: "mobile" as const,
        experimentOptIn: false,
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = Date.now();
    let httpStatus = 0;

    try {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        const latencyMs = Date.now() - started;
        this.lastMeta = { latencyMs, url, httpStatus: 0 };
        if ((err as Error).name === "AbortError") {
          throw new Error(
            `Live SUT timeout after ${this.timeoutMs}ms calling ${url}. ` +
              `Is the API up? Set BETTERMTA_LIVE_API_BASE (default http://127.0.0.1:8080; host-native often :3080).`
          );
        }
        throw new Error(
          `Live SUT network error calling ${url}: ${(err as Error).message}. ` +
            `Fail-closed — no third-party scrape fallback.`
        );
      }

      httpStatus = res.status;
      const latencyMs = Date.now() - started;
      this.lastMeta = { latencyMs, url, httpStatus };

      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(
          `Live SUT received non-JSON response from ${url} (HTTP ${res.status}): ${text.slice(0, 200)}`
        );
      }

      if (!res.ok) {
        const errObj = json as { error?: { code?: string; message?: string }; code?: string; message?: string };
        const code = errObj.error?.code ?? errObj.code ?? `http_${res.status}`;
        const message =
          errObj.error?.message ?? errObj.message ?? res.statusText;
        throw new Error(
          `Live SUT HTTP ${res.status} from ${url}: ${code} — ${message}`
        );
      }

      const response = json as RouteSearchResponse;
      if (!response.contractVersion || !response.dataMode) {
        throw new Error(
          `Live SUT response from ${url} missing contractVersion/dataMode — not a RouteSearchResponse`
        );
      }

      this.latenciesMs.push(latencyMs);
      return response;
    } finally {
      clearTimeout(timer);
      if (!this.lastMeta) {
        this.lastMeta = { latencyMs: Date.now() - started, url, httpStatus };
      }
    }
  }
}

/**
 * Live API accepts PlaceRef, but this adapter always sends { placeId } only.
 * stationId refs are mapped to placeId (`st:<id>` when bare).
 * coordinate refs are rejected (fail closed) — use place search first.
 */
export function toLivePlaceRef(
  ref: PlaceRef,
  label: string
): { placeId: string } {
  if ("placeId" in ref && ref.placeId) {
    return { placeId: ref.placeId };
  }
  if ("stationId" in ref && ref.stationId) {
    const id = ref.stationId;
    return { placeId: id.includes(":") ? id : `st:${id}` };
  }
  throw new Error(
    `Live SUT ${label}: only {placeId} (or mappable stationId) is supported; ` +
      `coordinate PlaceRefs must be resolved via /v1/places/search first`
  );
}
