export const CONTRACT_VERSION = "2026-07-30" as const;
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
