#!/usr/bin/env node
/**
 * Fail if a live production build's client chunks contain fixture markers.
 * Run after: NEXT_PUBLIC_API_MODE=live NEXT_PUBLIC_API_BASE_URL=… npm run build
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const chunksDir = join(__dirname, "../.next/static/chunks");

const MARKERS = [
  "req_fixture_",
  "createFixtureApiClient",
  "Fixture status",
  "gtfs_fixture_v1",
  "fixture-client",
];

function walk(dir) {
  /** @type {string[]} */
  const files = [];
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files.push(...walk(p));
    else files.push(p);
  }
  return files;
}

function main() {
  if (!existsSync(chunksDir)) {
    console.error(
      `verify:no-fixtures — missing ${chunksDir}. Run a live production build first.`,
    );
    process.exit(1);
  }

  const hits = [];
  for (const file of walk(chunksDir)) {
    const text = readFileSync(file, "utf8");
    for (const marker of MARKERS) {
      if (text.includes(marker)) {
        hits.push({ file, marker });
      }
    }
  }

  if (hits.length) {
    console.error("verify:no-fixtures — FIXTURE LEAK DETECTED:");
    for (const h of hits) {
      console.error(`  ${h.marker} in ${h.file}`);
    }
    process.exit(1);
  }

  console.log(
    `verify:no-fixtures — CLEAN (0 markers in ${chunksDir}; checked: ${MARKERS.join(", ")})`,
  );
}

main();
