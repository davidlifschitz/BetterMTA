import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = 3100;
const LOCAL_BASE = `http://127.0.0.1:${PORT}`;
const API = "http://127.0.0.1:3999";
const webRoot = path.resolve(__dirname);

function parseExternalBase(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("BETTERMTA_E2E_EXTERNAL_BASE must be a runner-local origin");
  }
  if (
    parsed.protocol !== "http:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== String(PORT) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("BETTERMTA_E2E_EXTERNAL_BASE must be a runner-local origin");
  }
  return parsed.origin;
}

const externalBase = parseExternalBase(
  process.env.BETTERMTA_E2E_EXTERNAL_BASE,
);
const BASE = externalBase ?? LOCAL_BASE;

const liveEnv = {
  ...process.env,
  NEXT_PUBLIC_API_MODE: "live",
  NEXT_PUBLIC_API_BASE_URL: API,
  NEXT_PUBLIC_FLAG_FEEDBACK: "false",
};

/**
 * Default suite: live-mode Next build + start, API mocked via route interception.
 * Live-stack specs are env-gated (BETTERMTA_E2E_LIVE_BASE) and skipped otherwise.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "mocked-live",
      testIgnore: /live-stack\.spec\.cjs/,
    },
    {
      name: "live-stack",
      testMatch: /live-stack\.spec\.cjs/,
      use: {
        baseURL: process.env.BETTERMTA_E2E_LIVE_BASE || BASE,
      },
    },
  ],
  webServer: externalBase ? undefined : {
    command: `npm run build && npx next start -p ${PORT} -H 127.0.0.1`,
    url: BASE,
    reuseExistingServer: false,
    timeout: 240_000,
    cwd: webRoot,
    env: liveEnv,
  },
});
