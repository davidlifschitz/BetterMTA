import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    server: {
      deps: {
        // Transform the TypeScript source export from the local file: package.
        inline: ["@bettermta/routing"],
      },
    },
  },
});
