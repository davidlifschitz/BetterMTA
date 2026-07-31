export const CONTRACT_VERSION = "2026-07-31" as const;
export const MAX_PAYLOAD_BYTES = 16 * 1024;
export const MAX_SELECTED_LINES = 5;
export const MAX_REQUEST_ID_LENGTH = 128;
export const LINES_CACHE_TTL_MS_DEFAULT = 5 * 60 * 1000;
export const ROUTE_CACHE_TTL_MS_DEFAULT = 30 * 1000;
export const REQUEST_TIMEOUT_MS_DEFAULT = 2_000;
export const RATE_LIMIT_WINDOW_MS_DEFAULT = 60_000;
export const RATE_LIMIT_MAX_DEFAULT = 120;
/** Larger bucket for cheap GETs (/v1/lines, /v1/status). */
export const CHEAP_RATE_LIMIT_MAX_DEFAULT = 600;

/** Live data-service status poll TTL. */
export const DATA_STATUS_TTL_MS_DEFAULT = 5_000;
/** Live line/station catalog TTL. */
export const DATA_CATALOG_TTL_MS_DEFAULT = 60_000;
/** OTP reachability probe cache TTL for /health/ready. */
export const OTP_PROBE_TTL_MS_DEFAULT = 10_000;
export const OTP_TIMEOUT_MS_DEFAULT = 4_000;
export const DATA_INTERNAL_URL_DEFAULT = "http://localhost:8081";
export const OTP_URL_DEFAULT = "http://localhost:8090";

/** Address/POI geocoder defaults (ADR-0022). */
export const GEOCODER_TIMEOUT_MS_DEFAULT = 1_500;
export const GEOCODER_MAX_ATTEMPTS_DEFAULT = 2;
/** Public Nominatim policy ≈ 1 req/s. */
export const GEOCODER_MIN_INTERVAL_MS_DEFAULT = 1_100;
export const GEOCODER_QUERY_CACHE_TTL_MS_DEFAULT = 60_000;
export const GEOCODER_QUERY_CACHE_MAX_DEFAULT = 256;
export const GEOCODER_RESOLVE_CACHE_TTL_MS_DEFAULT = 15 * 60 * 1000;
export const NOMINATIM_BASE_URL_DEFAULT =
  "https://nominatim.openstreetmap.org";
