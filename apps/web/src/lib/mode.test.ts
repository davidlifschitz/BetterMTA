import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiMode,
  isFeedbackEnabled,
  isFixtureMode,
  isLiveMode,
  shouldOfferArriveBy,
  shouldShowFeedback,
} from "@/lib/mode";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mode flags", () => {
  it("defaults to fixture when unset", () => {
    const env = {};
    expect(apiMode(env)).toBe("fixture");
    expect(isFixtureMode(env)).toBe(true);
    expect(isLiveMode(env)).toBe(false);
  });

  it("treats NEXT_PUBLIC_API_MODE=live as live", () => {
    const env = { NEXT_PUBLIC_API_MODE: "live" };
    expect(apiMode(env)).toBe("live");
    expect(isLiveMode(env)).toBe(true);
    expect(isFixtureMode(env)).toBe(false);
  });

  it("defaults feedback flag off", () => {
    expect(isFeedbackEnabled({})).toBe(false);
    expect(isFeedbackEnabled({ NEXT_PUBLIC_FLAG_FEEDBACK: "false" })).toBe(
      false,
    );
  });

  it("enables feedback only for true/1", () => {
    expect(isFeedbackEnabled({ NEXT_PUBLIC_FLAG_FEEDBACK: "true" })).toBe(
      true,
    );
    expect(isFeedbackEnabled({ NEXT_PUBLIC_FLAG_FEEDBACK: "1" })).toBe(true);
    expect(isFeedbackEnabled({ NEXT_PUBLIC_FLAG_FEEDBACK: "yes" })).toBe(
      false,
    );
  });

  it("hides feedback in live when flag off", () => {
    expect(
      shouldShowFeedback({
        NEXT_PUBLIC_API_MODE: "live",
        NEXT_PUBLIC_FLAG_FEEDBACK: undefined,
      }),
    ).toBe(false);
  });

  it("shows feedback in live when flag on", () => {
    expect(
      shouldShowFeedback({
        NEXT_PUBLIC_API_MODE: "live",
        NEXT_PUBLIC_FLAG_FEEDBACK: "true",
      }),
    ).toBe(true);
  });

  it("keeps feedback in fixture mode for demos", () => {
    expect(shouldShowFeedback({ NEXT_PUBLIC_API_MODE: "fixture" })).toBe(
      true,
    );
    expect(shouldShowFeedback({})).toBe(true);
  });

  it("hides arrive-by in live mode (ADR-0014)", () => {
    expect(shouldOfferArriveBy({ NEXT_PUBLIC_API_MODE: "live" })).toBe(false);
    expect(shouldOfferArriveBy({ NEXT_PUBLIC_API_MODE: "fixture" })).toBe(
      true,
    );
  });
});
