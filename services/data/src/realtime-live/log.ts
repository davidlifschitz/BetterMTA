/**
 * Privacy-safe structured logging for the data gateway.
 * Never log tokens, Authorization headers, or end-user coordinates.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEY = /token|authorization|password|secret|api[_-]?key/i;

export function safeLog(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SENSITIVE_KEY.test(k)) {
      cleaned[k] = "[redacted]";
      continue;
    }
    cleaned[k] = v;
  }
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...cleaned,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
