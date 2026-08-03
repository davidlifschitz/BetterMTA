import { describe, expect, it } from "vitest";
import {
  coverageFailureDetails,
  errorUiForCode,
  NETWORK_UNAVAILABLE_UI,
} from "@/lib/api-error-ui";
import type { ApiErrorBody } from "@/lib/contracts";
import insufficientCoverage from "../../../../contracts/fixtures/errors/insufficient-candidate-coverage.json";

describe("errorUiForCode", () => {
  it("maps contracted codes to distinct phases/testIds", () => {
    expect(errorUiForCode("no_transit_path").testId).toBe("no-route-state");
    expect(errorUiForCode("data_unavailable").testId).toBe(
      "unavailable-state",
    );
    expect(errorUiForCode("timeout").testId).toBe("timeout-state");
    expect(errorUiForCode("rate_limited").testId).toBe("rate-limited-state");
    expect(errorUiForCode("invalid_input").phase).toBe("invalid");
    expect(errorUiForCode("insufficient_candidate_coverage").phase).toBe(
      "coverage_failure",
    );
    expect(errorUiForCode("insufficient_candidate_coverage").testId).toBe(
      "coverage-failure-state",
    );
  });

  it("exposes honest network-unavailable copy", () => {
    expect(NETWORK_UNAVAILABLE_UI.title).toMatch(/unavailable/i);
    expect(NETWORK_UNAVAILABLE_UI.testId).toBe("unavailable-state");
  });

  it("surfaces coverage failure details with rider-facing S for GS", () => {
    const details = coverageFailureDetails(
      insufficientCoverage as ApiErrorBody,
    );
    expect(details.join(" ")).toMatch(/Preferred lines: 2, 7, S/);
    expect(details.join(" ")).toMatch(/Routes found using all preferred lines: 0/);
    expect(details.join(" ")).toMatch(/route-search limit/i);
  });

  it("uses rider language for insufficient candidate coverage", () => {
    const ui = errorUiForCode("insufficient_candidate_coverage");
    const details = coverageFailureDetails(
      insufficientCoverage as ApiErrorBody,
    );
    const copy = [ui.title, ui.defaultBody, ...details].join(" ");

    expect(copy).toMatch(/preferred lines/i);
    expect(copy).not.toMatch(/candidate|coverage|search budget/i);
  });
});
