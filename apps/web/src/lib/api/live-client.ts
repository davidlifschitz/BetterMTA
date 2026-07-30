import type {
  LinesResponse,
  PlaceSearchResponse,
  RouteSearchRequest,
  RouteSearchResponse,
  StatusResponse,
} from "@/lib/contracts";
import {
  ApiClientError,
  isApiErrorBody,
  type BetterMtaApi,
} from "@/lib/api/types";

/**
 * Live HTTP client for the BetterMTA `/v1` API.
 * Enable by setting NEXT_PUBLIC_API_MODE=live and NEXT_PUBLIC_API_BASE_URL.
 */
export function createLiveApiClient(baseUrl: string): BetterMtaApi {
  const root = baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${root}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      if (isApiErrorBody(json)) {
        throw new ApiClientError(res.status, json);
      }
      throw new ApiClientError(res.status, {
        error: {
          code: "internal_error",
          message: `Request failed with status ${res.status}`,
          requestId: "unknown",
        },
      });
    }
    return json as T;
  }

  return {
    searchRoutes(body: RouteSearchRequest) {
      return request<RouteSearchResponse>("/v1/routes/search", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    getLines() {
      return request<LinesResponse>("/v1/lines");
    },
    searchPlaces(query: string) {
      const q = encodeURIComponent(query);
      return request<PlaceSearchResponse>(`/v1/places/search?q=${q}`);
    },
    getStatus() {
      return request<StatusResponse>("/v1/status");
    },
  };
}
