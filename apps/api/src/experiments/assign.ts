import { createHash } from "node:crypto";

/**
 * Deterministic explanationVariant assignment from requestId (or optional seed).
 * Hash parity bit → concise | detailed.
 */
export function assignExplanationVariant(
  requestId: string,
  seed?: string,
): "concise" | "detailed" {
  const material = seed && seed.length > 0 ? seed : requestId;
  const digest = createHash("sha256").update(material).digest();
  return digest[0]! % 2 === 0 ? "concise" : "detailed";
}
