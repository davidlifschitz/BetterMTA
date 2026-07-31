/**
 * Tiny AJV helper that validates payloads against conductor-owned schemas.
 */
const { createRequire } = require("node:module");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const contractsRoot = join(__dirname, "../../../../contracts");
const requireFromContracts = createRequire(join(contractsRoot, "package.json"));

/** @type {import('ajv').default | null} */
let ajvSingleton = null;

async function getAjv() {
  if (ajvSingleton) return ajvSingleton;
  const { default: Ajv2020 } = await import(
    requireFromContracts.resolve("ajv/dist/2020.js")
  );
  const addFormats = (await import(requireFromContracts.resolve("ajv-formats")))
    .default;
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: true,
  });
  addFormats(ajv);

  const schemaDir = join(contractsRoot, "schemas");
  for (const file of [
    "common.schema.json",
    "satisfaction.schema.json",
    "itinerary.schema.json",
    "data-snapshot.schema.json",
    "api-error.schema.json",
    "lines-response.schema.json",
    "place-search-response.schema.json",
    "route-search-request.schema.json",
    "route-search-response.schema.json",
    "status-response.schema.json",
  ]) {
    const schema = JSON.parse(readFileSync(join(schemaDir, file), "utf8"));
    ajv.addSchema(schema, schema.$id || file);
  }
  ajvSingleton = ajv;
  return ajv;
}

/**
 * @param {string} schemaFile e.g. "route-search-response.schema.json"
 * @param {unknown} data
 */
async function assertValidSchema(schemaFile, data) {
  const ajv = await getAjv();
  const schema = JSON.parse(
    readFileSync(join(contractsRoot, "schemas", schemaFile), "utf8"),
  );
  const id = schema.$id || schemaFile;
  const validate = ajv.getSchema(id);
  if (!validate) {
    throw new Error(`Schema not registered: ${schemaFile} (${id})`);
  }
  const ok = validate(data);
  if (!ok) {
    const msg = (validate.errors ?? [])
      .map((e) => `${e.instancePath} ${e.message}`)
      .join("; ");
    throw new Error(`Schema ${schemaFile} validation failed: ${msg}`);
  }
}

/** @param {string} relativePath */
function loadFixture(relativePath) {
  return JSON.parse(
    readFileSync(join(contractsRoot, "fixtures", relativePath), "utf8"),
  );
}

module.exports = { assertValidSchema, loadFixture };
