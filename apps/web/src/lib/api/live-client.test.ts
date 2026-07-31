import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiveApiClient } from "@/lib/api/live-client";

describe("live API client URL construction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses same-origin relative paths when base URL is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ dataMode: "stale", lines: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const api = createLiveApiClient("");
    await api.getStatus();

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/status",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("prefixes an absolute origin when base URL is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ dataMode: "stale", lines: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const api = createLiveApiClient("http://localhost:8080");
    await api.getLines();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/v1/lines",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });
});
