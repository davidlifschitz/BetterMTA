import { createLiveApiClient } from "@/lib/api/live-client";
import type { BetterMtaApi } from "@/lib/api/types";

/** Live-mode client factory — no fixture imports. */
export async function createApiClient(): Promise<BetterMtaApi> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is required when NEXT_PUBLIC_API_MODE=live",
    );
  }
  return createLiveApiClient(baseUrl);
}
