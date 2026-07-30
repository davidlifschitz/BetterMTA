import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { BenchmarkCase } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BENCHMARKS_ROOT = path.resolve(__dirname, "../..");
export const CASES_DIR = path.join(BENCHMARKS_ROOT, "cases");
export const CASE_SCHEMA_PATH = path.join(
  BENCHMARKS_ROOT,
  "schema",
  "benchmark-case.schema.json"
);
export const REPO_ROOT = path.resolve(BENCHMARKS_ROOT, "..");
export const CONTRACTS_ROOT = path.join(REPO_ROOT, "contracts");
export const CONDUCTOR_FIXTURES_DIR = path.join(
  CONTRACTS_ROOT,
  "fixtures",
  "routes"
);
export const QA_FIXTURES_DIR = path.join(
  BENCHMARKS_ROOT,
  "fixtures",
  "sut-responses"
);
export const ITINERARY_SCHEMA_PATH = path.join(
  CONTRACTS_ROOT,
  "schemas",
  "itinerary.schema.json"
);

export async function loadJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export function createCaseValidator() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateSchema: false,
  });
  addFormats(ajv);
  return ajv;
}

export async function loadAndValidateCases(): Promise<{
  cases: BenchmarkCase[];
  errors: Array<{ file: string; message: string }>;
}> {
  const schema = await loadJson<object>(CASE_SCHEMA_PATH);
  const ajv = createCaseValidator();
  const validate = ajv.compile(schema);

  const files = (await readdir(CASES_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();

  const cases: BenchmarkCase[] = [];
  const errors: Array<{ file: string; message: string }> = [];

  for (const file of files) {
    const full = path.join(CASES_DIR, file);
    let data: unknown;
    try {
      data = await loadJson(full);
    } catch (err) {
      errors.push({
        file,
        message: `JSON parse error: ${(err as Error).message}`,
      });
      continue;
    }

    if (!validate(data)) {
      errors.push({
        file,
        message: ajv.errorsText(validate.errors, { separator: "; " }),
      });
      continue;
    }

    const c = data as BenchmarkCase;
    if (c.caseId !== file.replace(/\.json$/, "")) {
      errors.push({
        file,
        message: `caseId "${c.caseId}" must match filename stem "${file.replace(/\.json$/, "")}"`,
      });
      continue;
    }
    cases.push(c);
  }

  return { cases, errors };
}

export function caseToRequest(c: BenchmarkCase) {
  return {
    origin: c.origin,
    destination: c.destination,
    timing: c.timing,
    selectedLineIds: c.selectedLineIds,
    clientContext: { viewport: "mobile" as const, experimentOptIn: false },
  };
}
