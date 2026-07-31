/**
 * Hollow feed detection for GTFS-RT messages.
 *
 * A feed is hollow when it has zero usable wire entities (no trip updates,
 * alerts, or vehicles), even if the header carries NYCT trip_replacement_period.
 * Hollow captures must not displace raw or snapshot LKG.
 */

import type { DecodedFeedMessage } from "./proto.js";
import type { ParsedRealtimeFeed } from "../realtime/parser.js";

/** True when the decoded protobuf has no tripUpdate/alert/vehicle entities. */
export function isHollowDecodedFeed(decoded: DecodedFeedMessage): boolean {
  if (decoded.entity.length === 0) return true;
  return !decoded.entity.some(
    (e) => Boolean(e.tripUpdate || e.alert || e.vehicle),
  );
}

/** True when a normalized feed had no usable wire entities. */
export function isHollowParsedFeed(
  parsed: ParsedRealtimeFeed | null | undefined,
): boolean {
  if (!parsed) return true;
  return parsed.hasWireEntities !== true;
}
