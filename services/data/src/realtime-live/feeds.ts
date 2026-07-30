/**
 * Binding feed catalog for MTA GTFS-Realtime subway feeds.
 * Internal feedIds are BINDING — OTP router config consumes these path ids.
 */

export interface RealtimeFeedDef {
  feedId: string;
  /** Path segment under the MTA Dataservice host (URL-encoded form used in fetch). */
  pathEncoded: string;
  /** Human trunk description */
  trunk: string;
  /** Whether this feed participates in overall dataMode computation */
  requiredForMode: boolean;
  /** Kind of entities expected */
  kind: "trip_updates" | "alerts";
}

export const MTA_GTFS_RT_BASE =
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds";

/**
 * BINDING feed id list. Do not rename without coordinating OTP updaters.
 */
export const REALTIME_FEEDS: readonly RealtimeFeedDef[] = [
  {
    feedId: "nyct-gtfs",
    pathEncoded: "nyct%2Fgtfs",
    trunk: "1–7 + GS",
    requiredForMode: true,
    kind: "trip_updates",
  },
  {
    feedId: "nyct-gtfs-ace",
    pathEncoded: "nyct%2Fgtfs-ace",
    trunk: "A, C, E, H, FS",
    requiredForMode: true,
    kind: "trip_updates",
  },
  {
    feedId: "nyct-gtfs-bdfm",
    pathEncoded: "nyct%2Fgtfs-bdfm",
    trunk: "B, D, F, M, FX",
    requiredForMode: true,
    kind: "trip_updates",
  },
  {
    feedId: "nyct-gtfs-g",
    pathEncoded: "nyct%2Fgtfs-g",
    trunk: "G",
    requiredForMode: true,
    kind: "trip_updates",
  },
  {
    feedId: "nyct-gtfs-jz",
    pathEncoded: "nyct%2Fgtfs-jz",
    trunk: "J, Z",
    requiredForMode: true,
    kind: "trip_updates",
  },
  {
    feedId: "nyct-gtfs-nqrw",
    pathEncoded: "nyct%2Fgtfs-nqrw",
    trunk: "N, Q, R, W",
    requiredForMode: true,
    kind: "trip_updates",
  },
  {
    feedId: "nyct-gtfs-l",
    pathEncoded: "nyct%2Fgtfs-l",
    trunk: "L",
    requiredForMode: true,
    kind: "trip_updates",
  },
  {
    feedId: "nyct-gtfs-si",
    pathEncoded: "nyct%2Fgtfs-si",
    trunk: "SIR",
    requiredForMode: true,
    kind: "trip_updates",
  },
  {
    feedId: "camsys-subway-alerts",
    pathEncoded: "camsys%2Fsubway-alerts",
    trunk: "Subway service alerts",
    requiredForMode: false,
    kind: "alerts",
  },
] as const;

export const REQUIRED_FEED_IDS: readonly string[] = REALTIME_FEEDS.filter(
  (f) => f.requiredForMode,
).map((f) => f.feedId);

export function feedUrl(feed: RealtimeFeedDef, base = MTA_GTFS_RT_BASE): string {
  return `${base.replace(/\/$/, "")}/${feed.pathEncoded}`;
}

export function getFeedDef(feedId: string): RealtimeFeedDef | undefined {
  return REALTIME_FEEDS.find((f) => f.feedId === feedId);
}
