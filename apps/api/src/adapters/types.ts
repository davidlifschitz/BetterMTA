import type {
  AdapterReadiness,
  LinesResponse,
  Place,
  PlaceSearchResponse,
  RouteSearchRequest,
  RouteSearchResponse,
  RoutingSnapshotHandle,
  StatusResponse,
} from "../types.js";

export interface DataAdapter {
  getSnapshotHandle(): Promise<RoutingSnapshotHandle>;
  listLines(): Promise<LinesResponse>;
  searchPlaces(input: {
    query: string;
    limit: number;
    proximityLat?: number;
    proximityLon?: number;
  }): Promise<PlaceSearchResponse>;
  getStatus(): Promise<StatusResponse>;
  getReadiness(): Promise<AdapterReadiness>;
  /** Resolve place refs for routing validation (placeId / stationId catalogs). */
  resolvePlace(ref: { placeId?: string; stationId?: string }): Promise<Place | null>;
  knownLineIds(): Promise<Set<string>>;
}

export interface RoutingSearchInput {
  request: RouteSearchRequest;
  selectedLineIds: string[];
  snapshot: RoutingSnapshotHandle;
  requestId: string;
  explanationVariant: "concise" | "detailed";
  /** Test/control hook: artificial delay before returning. */
  artificialDelayMs?: number;
  signal?: AbortSignal;
}

export interface RoutingAdapter {
  searchRoutes(input: RoutingSearchInput): Promise<RouteSearchResponse>;
}
