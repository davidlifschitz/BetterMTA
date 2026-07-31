/**
 * Privacy-safe structured logging for the static pipeline.
 * Never log credentials; strip query/userinfo from URLs.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  stage?: string;
  versionId?: string;
  sha256?: string;
  bytes?: number;
  durationMs?: number;
  errorCode?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export function sanitizeUrl(url: string): string {
  try {
    if (url.startsWith("file:") || url.startsWith("/")) {
      // Keep path basename only for local sources
      const base = url.replace(/^file:\/\//, "").split(/[\\/]/).pop() ?? "local";
      return `local://${base}`;
    }
    const u = new URL(url);
    u.username = "";
    u.password = "";
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return "[unparseable-url]";
  }
}

export type Logger = (
  level: LogLevel,
  message: string,
  fields?: LogFields,
) => void;

export const defaultLogger: Logger = (level, message, fields = {}) => {
  const payload = {
    ts: new Date().toISOString(),
    level,
    component: "static-pipeline",
    message,
    ...fields,
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};
