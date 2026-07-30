import { createHash } from "node:crypto";

/** Binding version-id convention for other workstreams. */
export function versionIdFromSha256(sha256Hex: string): string {
  const hex = sha256Hex.replace(/^sha256:/, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hex)) {
    throw new Error(`Invalid sha256 hex for version id: ${sha256Hex}`);
  }
  return `mta-subway-${hex.slice(0, 12)}`;
}

export function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function normalizeSha256(value: string): string {
  return value.replace(/^sha256:/, "").toLowerCase();
}

export function formatChecksum(sha256Hex: string): string {
  return `sha256:${normalizeSha256(sha256Hex)}`;
}
