import type { BetterMtaApi } from "@/lib/api/types";

/**
 * Fixture-mode client factory.
 * Loads fixture payloads only via dynamic import so live builds that swap this
 * module out never see fixture JSON in their module graph.
 */
export async function createApiClient(): Promise<BetterMtaApi> {
  const { createFixtureApiClient } = await import("@/lib/api/fixture-client");
  return createFixtureApiClient();
}
