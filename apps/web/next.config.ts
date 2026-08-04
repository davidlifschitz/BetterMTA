import type { NextConfig } from "next";
import path from "path";

const apiMode = process.env.NEXT_PUBLIC_API_MODE ?? "fixture";

const nextConfig: NextConfig = {
  // Allow importing conductor-owned contracts + fixtures from repo root.
  experimental: {
    externalDir: true,
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    const existingAliases =
      (config.resolve.alias as Record<string, string | false | string[]>) ?? {};
    let alias: Record<string, string | false | string[]> = {
      ...existingAliases,
      "@contracts": path.resolve(__dirname, "../../contracts"),
    };

    // Live builds swap the create-client module to a factory with zero fixture
    // imports, so fixture JSON cannot enter the client graph (dynamic import
    // of fixture-client lives only in create-client.fixture.ts).
    if (apiMode === "live") {
      const liveFactory = path.resolve(
        __dirname,
        "src/lib/api/create-client.live.ts",
      );

      // The application imports this module through the @/* TypeScript alias.
      // Alias that exact request before path expansion, and retain the absolute
      // aliases for requests that Next/Webpack has already normalized.
      const exactLiveAliases = {
        "@/lib/api/create-client$": liveFactory,
        "@/lib/api/create-client": liveFactory,
        [path.resolve(__dirname, "src/lib/api/create-client.ts")]: liveFactory,
        [path.resolve(__dirname, "src/lib/api/create-client")]: liveFactory,
      };
      for (const key of Object.keys(exactLiveAliases)) {
        delete existingAliases[key];
      }
      alias = {
        ...exactLiveAliases,
        ...existingAliases,
        "@contracts": path.resolve(__dirname, "../../contracts"),
      };
    }

    config.resolve.alias = alias;
    return config;
  },
};

export default nextConfig;
