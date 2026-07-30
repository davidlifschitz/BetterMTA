#!/usr/bin/env node
/**
 * Validates conductor fixtures against JSON Schema and checks OpenAPI path lock.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const require = createRequire(import.meta.url);

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function walkJsonFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJsonFiles(p));
    else if (entry.name.endsWith(".json")) out.push(p);
  }
  return out;
}

async function ensureDeps() {
  const missing = [];
  for (const name of ["ajv", "ajv-formats", "js-yaml"]) {
    try {
      require.resolve(name);
    } catch {
      missing.push(name);
    }
  }
  if (missing.length) {
    console.error(
      `Missing dependencies: ${missing.join(", ")}. Run: cd contracts && npm install`
    );
    process.exit(1);
  }
}

async function main() {
  await ensureDeps();
  const { default: Ajv2020 } = await import("ajv/dist/2020.js");
  const addFormats = (await import("ajv-formats")).default;
  const yaml = await import("js-yaml");

  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: true,
  });
  addFormats(ajv);

  const schemaDir = join(root, "schemas");
  const schemaFiles = readdirSync(schemaDir).filter((f) => f.endsWith(".schema.json"));
  /** @type {Map<string, object>} */
  const schemasByFile = new Map();
  for (const file of schemaFiles) {
    const schema = loadJson(join(schemaDir, file));
    schemasByFile.set(file, schema);
    ajv.addSchema(schema, schema.$id || file);
  }

  const fixtureChecks = [
    {
      file: "fixtures/routes/request-depart-now.json",
      schema: "route-search-request.schema.json",
    },
    {
      file: "fixtures/routes/complete-match.json",
      schema: "route-search-response.schema.json",
    },
    {
      file: "fixtures/routes/partial-match.json",
      schema: "route-search-response.schema.json",
    },
    {
      file: "fixtures/routes/degraded-realtime.json",
      schema: "route-search-response.schema.json",
    },
    {
      file: "fixtures/routes/baseline-only.json",
      schema: "route-search-response.schema.json",
    },
    {
      file: "fixtures/routes/feasibility-none.json",
      schema: "route-search-response.schema.json",
    },
    {
      file: "fixtures/lines/subway-lines.json",
      schema: "lines-response.schema.json",
    },
    {
      file: "fixtures/places/place-search.json",
      schema: "place-search-response.schema.json",
    },
    {
      file: "fixtures/status/healthy.json",
      schema: "status-response.schema.json",
    },
    {
      file: "fixtures/status/degraded.json",
      schema: "status-response.schema.json",
    },
    {
      file: "fixtures/errors/unknown-line.json",
      schema: "api-error.schema.json",
    },
    {
      file: "fixtures/errors/no-transit-path.json",
      schema: "api-error.schema.json",
    },
  ];

  let failures = 0;

  for (const check of fixtureChecks) {
    const dataPath = join(root, check.file);
    const schema = schemasByFile.get(check.schema);
    if (!schema) {
      console.error(`FAIL missing schema ${check.schema}`);
      failures += 1;
      continue;
    }
    const validate = ajv.compile(schema);
    const data = loadJson(dataPath);
    const ok = validate(data);
    if (!ok) {
      failures += 1;
      console.error(`FAIL ${check.file}`);
      console.error(validate.errors);
    } else {
      console.log(`OK   ${check.file}`);
    }
  }

  // Satisfaction accounting sanity on constrained fixtures
  for (const file of [
    "fixtures/routes/complete-match.json",
    "fixtures/routes/partial-match.json",
    "fixtures/routes/degraded-realtime.json",
    "fixtures/routes/feasibility-none.json",
  ]) {
    const payload = loadJson(join(root, file));
    for (const itin of payload.constrained.itineraries) {
      const s = itin.satisfaction;
      const distinctTransit = [
        ...new Set(
          itin.legs.filter((l) => l.kind === "transit").map((l) => l.lineId)
        ),
      ];
      for (const lineId of s.satisfiedLineIds) {
        if (!distinctTransit.includes(lineId)) {
          failures += 1;
          console.error(
            `FAIL ${file}: satisfied line ${lineId} not present on transit legs`
          );
        }
        if (!s.requestedLineIds.includes(lineId)) {
          failures += 1;
          console.error(
            `FAIL ${file}: satisfied line ${lineId} not in requestedLineIds`
          );
        }
      }
      if (s.satisfactionCount !== s.satisfiedLineIds.length) {
        failures += 1;
        console.error(`FAIL ${file}: satisfactionCount mismatch`);
      }
      if (s.requestedCount !== s.requestedLineIds.length) {
        failures += 1;
        console.error(`FAIL ${file}: requestedCount mismatch`);
      }
      const omitted = s.requestedLineIds.filter(
        (id) => !s.satisfiedLineIds.includes(id)
      );
      if (JSON.stringify(omitted) !== JSON.stringify(s.omittedLineIds)) {
        failures += 1;
        console.error(`FAIL ${file}: omittedLineIds mismatch`);
      }
      if (s.isComplete !== (s.satisfactionCount === s.requestedCount)) {
        failures += 1;
        console.error(`FAIL ${file}: isComplete mismatch`);
      }
    }
  }

  // OpenAPI lock checks
  const openapiPath = join(root, "openapi/bettermta-v1.yaml");
  if (!existsSync(openapiPath)) {
    failures += 1;
    console.error("FAIL missing openapi/bettermta-v1.yaml");
  } else {
    const doc = yaml.load(readFileSync(openapiPath, "utf8"));
    const requiredPaths = [
      "/v1/routes/search",
      "/v1/lines",
      "/v1/places/search",
      "/v1/status",
      "/health/live",
      "/health/ready",
    ];
    for (const p of requiredPaths) {
      if (!doc?.paths?.[p]) {
        failures += 1;
        console.error(`FAIL OpenAPI missing path ${p}`);
      } else {
        console.log(`OK   openapi path ${p}`);
      }
    }
    if (doc?.info?.version !== "2026-07-30") {
      failures += 1;
      console.error("FAIL OpenAPI info.version must be 2026-07-30");
    } else {
      console.log("OK   openapi info.version");
    }
  }

  // TypeScript export smoke: file exists and contains CONTRACT_VERSION
  const tsPath = join(root, "typescript/index.ts");
  const ts = readFileSync(tsPath, "utf8");
  if (!ts.includes('CONTRACT_VERSION = "2026-07-30"')) {
    failures += 1;
    console.error("FAIL typescript CONTRACT_VERSION mismatch");
  } else {
    console.log("OK   typescript/index.ts CONTRACT_VERSION");
  }

  // Ensure every fixture JSON under fixtures/ is accounted for or still valid JSON
  for (const file of walkJsonFiles(join(root, "fixtures"))) {
    try {
      loadJson(file);
    } catch (err) {
      failures += 1;
      console.error(`FAIL invalid JSON ${relative(root, file)}: ${err.message}`);
    }
  }

  // Docs presence check from repo root
  const docsRoot = join(root, "..", "docs");
  const requiredDocs = [
    "SYSTEM_ARCHITECTURE.md",
    "DOMAIN_MODEL.md",
    "API_CONTRACT.md",
    "DATA_CONTRACT.md",
    "ARCHITECTURE_DECISIONS.md",
    "INTEGRATION_SEQUENCE.md",
    "ACCEPTANCE_CRITERIA.md",
    "RISK_REGISTER.md",
    "WORKSTREAM_OWNERSHIP.md",
    "CONDUCTOR_PACKAGE.md",
  ];
  for (const doc of requiredDocs) {
    const p = join(docsRoot, doc);
    if (!existsSync(p)) {
      failures += 1;
      console.error(`FAIL missing docs/${doc}`);
    } else {
      console.log(`OK   docs/${doc}`);
    }
  }

  if (failures > 0) {
    console.error(`\nValidation failed with ${failures} error(s).`);
    process.exit(1);
  }
  console.log("\nAll conductor contract validations passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
