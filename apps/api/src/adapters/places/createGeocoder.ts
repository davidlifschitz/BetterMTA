import type { Logger } from "../../logging/logger.js";
import type { ApiConfig } from "../../config.js";
import { FakeGeocoderAdapter } from "./fakeGeocoder.js";
import { NominatimGeocoderAdapter } from "./nominatimGeocoder.js";
import type { GeocoderProvider } from "./types.js";

export type GeocoderProviderName = "none" | "fake" | "nominatim";

export function createGeocoderProvider(
  config: Pick<
    ApiConfig,
    | "geocoderProvider"
    | "nominatimBaseUrl"
    | "nominatimUserAgent"
    | "nominatimEmail"
    | "geocoderTimeoutMs"
    | "geocoderMaxAttempts"
    | "geocoderMinIntervalMs"
  >,
  logger?: Logger,
): GeocoderProvider | null {
  switch (config.geocoderProvider) {
    case "none":
      return null;
    case "fake":
      return new FakeGeocoderAdapter();
    case "nominatim": {
      if (!config.nominatimUserAgent || !config.nominatimUserAgent.trim()) {
        throw new Error(
          "BETTERMTA_NOMINATIM_USER_AGENT is required when BETTERMTA_GEOCODER_PROVIDER=nominatim",
        );
      }
      return new NominatimGeocoderAdapter({
        baseUrl: config.nominatimBaseUrl,
        userAgent: config.nominatimUserAgent,
        email: config.nominatimEmail,
        timeoutMs: config.geocoderTimeoutMs,
        maxAttempts: config.geocoderMaxAttempts,
        minIntervalMs: config.geocoderMinIntervalMs,
        logger,
      });
    }
    default: {
      const _exhaustive: never = config.geocoderProvider;
      void _exhaustive;
      return null;
    }
  }
}
