import fs from "node:fs";
import path from "node:path";

export function readJsonFixture<T>(fixturesRoot: string, relativePath: string): T {
  const full = path.join(fixturesRoot, relativePath);
  return JSON.parse(fs.readFileSync(full, "utf8")) as T;
}
