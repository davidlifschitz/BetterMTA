import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Deterministic: no network, no flaky timers beyond controlled clocks
    fileParallelism: false,
    // Existing fixture-era DataPlatform.importStatic tests need the explicit flag.
    env: {
      BETTERMTA_ALLOW_FIXTURE_STATIC: "true",
    },
  },
});
