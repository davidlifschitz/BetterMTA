import { isSensitiveLogKey } from "./privacy.js";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_ORDER: Record<Exclude<LogLevel, "silent">, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogFields {
  requestId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  errorCode?: string;
  [key: string]: unknown;
}

/**
 * Structured JSON logger.
 * Never logs precise lat/lon, raw address/POI query text, or vendor place IDs.
 * See `privacy.ts` + ADR-0022 / API_CONTRACT §11.
 */
export function createLogger(level: LogLevel = "info") {
  function shouldLog(at: Exclude<LogLevel, "silent">): boolean {
    if (level === "silent") return false;
    return LEVEL_ORDER[at] >= LEVEL_ORDER[level];
  }

  function write(at: Exclude<LogLevel, "silent">, msg: string, fields: LogFields = {}) {
    if (!shouldLog(at)) return;
    const safe = redactSensitive(fields);
    const line = JSON.stringify({
      level: at,
      msg,
      ts: new Date().toISOString(),
      ...safe,
    });
    if (at === "error") {
      console.error(line);
    } else if (at === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  return {
    debug: (msg: string, fields?: LogFields) => write("debug", msg, fields),
    info: (msg: string, fields?: LogFields) => write("info", msg, fields),
    warn: (msg: string, fields?: LogFields) => write("warn", msg, fields),
    error: (msg: string, fields?: LogFields) => write("error", msg, fields),
  };
}

export type Logger = ReturnType<typeof createLogger>;

const REDACTED = "[redacted]";

/** Testable redaction used by createLogger. */
export function redactSensitive(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (isSensitiveLogKey(k)) {
      out[k] = REDACTED;
      continue;
    }
    if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item && typeof item === "object"
          ? redactSensitive(item as LogFields)
          : item,
      );
      continue;
    }
    if (v && typeof v === "object") {
      out[k] = redactSensitive(v as LogFields);
      continue;
    }
    // Catch lat/lon embedded in free-form strings (e.g. "40.67912,-73.99534").
    if (typeof v === "string" && looksLikePreciseCoordinatePair(v)) {
      out[k] = REDACTED;
      continue;
    }
    out[k] = v;
  }
  return out;
}

/** Heuristic: decimal degree pair at >2 fractional digits. */
export function looksLikePreciseCoordinatePair(value: string): boolean {
  return /^-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}$/.test(value.trim());
}
