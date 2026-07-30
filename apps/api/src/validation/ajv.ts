import fs from "node:fs";
import path from "node:path";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

type AddFormats = (ajv: Ajv2020, options?: unknown) => Ajv2020;
const addFormats = (
  typeof addFormatsModule === "function"
    ? addFormatsModule
    : (addFormatsModule as { default: AddFormats }).default
) as AddFormats;

export interface CompiledValidators {
  validateRouteSearchRequest: ValidateFunction;
  validateRouteSearchResponse: ValidateFunction;
  validateLinesResponse: ValidateFunction;
  validatePlaceSearchResponse: ValidateFunction;
  validateStatusResponse: ValidateFunction;
  validateApiError: ValidateFunction;
}

export function loadValidators(contractsRoot: string): CompiledValidators {
  const schemasDir = path.join(contractsRoot, "schemas");
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateSchema: false,
  });
  addFormats(ajv);

  const schemaFiles = [
    "common.schema.json",
    "satisfaction.schema.json",
    "itinerary.schema.json",
    "route-search-request.schema.json",
    "route-search-response.schema.json",
    "lines-response.schema.json",
    "place-search-response.schema.json",
    "status-response.schema.json",
    "api-error.schema.json",
    "data-snapshot.schema.json",
  ];

  for (const file of schemaFiles) {
    const full = path.join(schemasDir, file);
    const schema = JSON.parse(fs.readFileSync(full, "utf8")) as object;
    ajv.addSchema(schema);
  }

  const get = (id: string): ValidateFunction => {
    const fn = ajv.getSchema(id);
    if (!fn) throw new Error(`Missing compiled schema ${id}`);
    return fn as ValidateFunction;
  };

  return {
    validateRouteSearchRequest: get(
      "https://bettermta.local/schemas/route-search-request.schema.json",
    ),
    validateRouteSearchResponse: get(
      "https://bettermta.local/schemas/route-search-response.schema.json",
    ),
    validateLinesResponse: get(
      "https://bettermta.local/schemas/lines-response.schema.json",
    ),
    validatePlaceSearchResponse: get(
      "https://bettermta.local/schemas/place-search-response.schema.json",
    ),
    validateStatusResponse: get(
      "https://bettermta.local/schemas/status-response.schema.json",
    ),
    validateApiError: get("https://bettermta.local/schemas/api-error.schema.json"),
  };
}

export function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors?.length) return "Request failed schema validation.";
  return errors
    .map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`.trim())
    .join("; ");
}
