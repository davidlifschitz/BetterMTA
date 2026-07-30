import { describe, expect, it } from "vitest";
import { errorUiForCode, NETWORK_UNAVAILABLE_UI } from "@/lib/api-error-ui";

describe("errorUiForCode", () => {
  it("maps contracted codes to distinct phases/testIds", () => {
    expect(errorUiForCode("no_transit_path").testId).toBe("no-route-state");
    expect(errorUiForCode("data_unavailable").testId).toBe(
      "unavailable-state",
    );
    expect(errorUiForCode("timeout").testId).toBe("timeout-state");
    expect(errorUiForCode("rate_limited").testId).toBe("rate-limited-state");
    expect(errorUiForCode("invalid_input").phase).toBe("invalid");
  });

  it("exposes honest network-unavailable copy", () => {
    expect(NETWORK_UNAVAILABLE_UI.title).toMatch(/unavailable/i);
    expect(NETWORK_UNAVAILABLE_UI.testId).toBe("unavailable-state");
  });
});
