import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Deterministic: no network, no flaky timers beyond controlled clocks
    fileParallelism: false,
  },
});
