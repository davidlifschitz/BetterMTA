import type {
  ApiErrorBody,
  LinesResponse,
  PlaceSearchResponse,
  RouteSearchRequest,
  RouteSearchResponse,
  StatusResponse,
} from "@/lib/contracts";

/**
 * BetterMTA public API surface used by the UI.
 *
 * SWAP POINT: change the implementation exported from `@/lib/api/index`
 * (fixture → live HTTP) without touching UI components.
 */
export interface BetterMtaApi {
  searchRoutes(request: RouteSearchRequest): Promise<RouteSearchResponse>;
  getLines(): Promise<LinesResponse>;
  searchPlaces(query: string): Promise<PlaceSearchResponse>;
  getStatus(): Promise<StatusResponse>;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = "ApiClientError";
    this.status = status;
    this.body = body;
  }
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== "object") return false;
  const err = (value as ApiErrorBody).error;
  return (
    !!err &&
    typeof err.code === "string" &&
    typeof err.message === "string" &&
    typeof err.requestId === "string"
  );
}
