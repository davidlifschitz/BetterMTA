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
    const alias: Record<string, string | false | string[]> = {
      ...((config.resolve.alias as Record<string, string | false | string[]>) ??
        {}),
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
      alias[path.resolve(__dirname, "src/lib/api/create-client.ts")] =
        liveFactory;
      alias[path.resolve(__dirname, "src/lib/api/create-client")] = liveFactory;
    }

    config.resolve.alias = alias;
    return config;
  },
};

export default nextConfig;
