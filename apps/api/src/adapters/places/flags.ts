import fs from "node:fs";
import path from "node:path";

export const ADDRESS_POI_FLAG = "address_poi_enabled" as const;

export interface FeatureFlagMap {
  [key: string]: boolean | string | number;
}

/**
 * Resolve feature flags for the API process.
 * Order: FEATURE_FLAGS_JSON env → FLAG_DEFAULTS_PATH / flags file → hardcoded defaults.
 */
export function loadFeatureFlags(opts: {
  featureFlagsJson?: string | null;
  flagDefaultsPath?: string | null;
  /** Direct override used by tests / config (wins over file defaults, loses to JSON env). */
  addressPoiEnabled?: boolean | null;
}): FeatureFlagMap {
  const flags: FeatureFlagMap = {
    [ADDRESS_POI_FLAG]: false,
  };

  const defaultsPath = opts.flagDefaultsPath;
  if (defaultsPath) {
    try {
      const abs = path.resolve(defaultsPath);
      const raw = fs.readFileSync(abs, "utf8");
      const parsed = JSON.parse(raw) as {
        flags?: Record<string, { default?: unknown }>;
      };
      const entry = parsed.flags?.[ADDRESS_POI_FLAG];
      if (entry && typeof entry.default === "boolean") {
        flags[ADDRESS_POI_FLAG] = entry.default;
      }
    } catch {
      // Missing/unreadable defaults file → keep hardcoded defaults.
    }
  }

  if (opts.addressPoiEnabled !== undefined && opts.addressPoiEnabled !== null) {
    flags[ADDRESS_POI_FLAG] = opts.addressPoiEnabled;
  }

  const jsonRaw = opts.featureFlagsJson;
  if (jsonRaw && jsonRaw.trim()) {
    try {
      const overlay = JSON.parse(jsonRaw) as Record<string, unknown>;
      if (typeof overlay[ADDRESS_POI_FLAG] === "boolean") {
        flags[ADDRESS_POI_FLAG] = overlay[ADDRESS_POI_FLAG];
      }
    } catch {
      throw new Error("Invalid FEATURE_FLAGS_JSON; expected JSON object");
    }
  }

  return flags;
}

export function isAddressPoiEnabled(flags: FeatureFlagMap): boolean {
  return flags[ADDRESS_POI_FLAG] === true;
}
