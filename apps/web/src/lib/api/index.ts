/**
 * API client swap point.
 *
 * Default: fixture mode (loads contracts/fixtures only via dynamic import inside
 * create-client.fixture.ts).
 * Live: set NEXT_PUBLIC_API_MODE=live and NEXT_PUBLIC_API_BASE_URL=https://…
 * next.config aliases this module's create-client import to the live factory,
 * which has zero fixture imports — verified by grepping live .next chunks.
 *
 * UI code must import `api` only from this module so switching backends is a
 * one-module change.
 */
import { createApiClient } from "@/lib/api/create-client";
import type { BetterMtaApi } from "@/lib/api/types";

export type { BetterMtaApi } from "@/lib/api/types";
export { ApiClientError, isApiErrorBody } from "@/lib/api/types";

let clientPromise: Promise<BetterMtaApi> | null = null;

function getClient(): Promise<BetterMtaApi> {
  if (!clientPromise) {
    clientPromise = createApiClient();
  }
  return clientPromise;
}

/** Lazy proxy so fixture mode can await the dynamic import without sync static deps. */
export const api: BetterMtaApi = {
  searchRoutes: (request) => getClient().then((c) => c.searchRoutes(request)),
  getLines: () => getClient().then((c) => c.getLines()),
  searchPlaces: (query) => getClient().then((c) => c.searchPlaces(query)),
  getStatus: () => getClient().then((c) => c.getStatus()),
};
