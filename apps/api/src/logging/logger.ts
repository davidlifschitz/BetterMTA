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
 * Never logs precise lat/lon or raw place-search query text.
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

/** Testable redaction used by createLogger. */
export function redactSensitive(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    const key = k.toLowerCase();
    if (
      key.includes("lat") ||
      key.includes("lon") ||
      key.includes("lng") ||
      key.includes("coordinate")
    ) {
      out[k] = "[redacted]";
      continue;
    }
    // Raw place-search / free-text query must never appear in logs.
    if (
      key === "query" ||
      key === "q" ||
      key === "rawquery" ||
      key === "searchquery" ||
      key === "querytext"
    ) {
      out[k] = "[redacted]";
      continue;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = redactSensitive(v as LogFields);
      continue;
    }
    out[k] = v;
  }
  return out;
}
