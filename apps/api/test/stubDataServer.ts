import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

export interface StubDataServerState {
  token: string | null;
  status: {
    staticVersionId: string | null;
    activeSince: string | null;
    realtime: {
      snapshotId: string;
      dataMode: string;
      ageSeconds: number | null;
      perFeed?: Record<string, unknown>;
    } | null;
    ready: boolean;
  };
  lines: Array<{
    lineId: string;
    label: string;
    displayName: string;
    color: string;
    textColor: string;
    gtfsRouteIds: string[];
    isShuttle: boolean;
  }>;
  stations: Array<{
    stationId: string;
    name: string;
    lat: number;
    lon: number;
    lineIds: string[];
    complexId?: string;
  }>;
  /** Force next request to hang / fail. */
  failNext?: boolean;
  /** Recorded Authorization headers. */
  authHeaders: Array<string | undefined>;
  hitCounts: Record<string, number>;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBearer(req: IncomingMessage): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() ?? null;
}

export function createStubDataState(
  overrides: Partial<StubDataServerState> = {},
): StubDataServerState {
  return {
    token: "test-token",
    status: {
      staticVersionId: "gtfs_live_v1",
      activeSince: "2026-07-29T06:00:00.000Z",
      realtime: {
        snapshotId: "rt_live_1",
        dataMode: "live",
        ageSeconds: 12,
        perFeed: {},
      },
      ready: true,
    },
    lines: [
      {
        lineId: "F",
        label: "F",
        displayName: "F train",
        color: "#FF6319",
        textColor: "#FFFFFF",
        gtfsRouteIds: ["F", "FX"],
        isShuttle: false,
      },
      {
        lineId: "B",
        label: "B",
        displayName: "B train",
        color: "#FF6319",
        textColor: "#FFFFFF",
        gtfsRouteIds: ["B"],
        isShuttle: false,
      },
    ],
    stations: [
      {
        stationId: "A42",
        name: "Carroll St",
        lat: 40.6803,
        lon: -74.0051,
        lineIds: ["F", "G"],
      },
      {
        stationId: "D14",
        name: "42 St-Bryant Park",
        lat: 40.7542,
        lon: -73.9845,
        lineIds: ["B", "D", "F", "M"],
      },
      {
        stationId: "R20",
        name: "Union Square",
        lat: 40.7359,
        lon: -73.9911,
        lineIds: ["4", "5", "6", "L", "N", "Q", "R", "W"],
      },
      {
        stationId: "R32",
        name: "Union St",
        lat: 40.6773,
        lon: -73.983,
        lineIds: ["R"],
      },
      {
        stationId: "G22",
        name: "Court Square",
        lat: 40.7465,
        lon: -73.9438,
        lineIds: ["7", "G", "E", "M"],
      },
    ],
    authHeaders: [],
    hitCounts: {},
    ...overrides,
  };
}

export async function startStubDataServer(
  state: StubDataServerState,
): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    state.hitCounts[path] = (state.hitCounts[path] ?? 0) + 1;
    state.authHeaders.push(req.headers.authorization);

    if (state.failNext) {
      state.failNext = false;
      res.destroy();
      return;
    }

    if (state.token) {
      if (readBearer(req) !== state.token) {
        sendJson(res, 401, { error: "unauthorized" });
        return;
      }
    }

    if (req.method === "GET" && path === "/internal/status") {
      sendJson(res, 200, state.status);
      return;
    }
    if (req.method === "GET" && path === "/internal/catalog/lines") {
      if (!state.status.staticVersionId) {
        sendJson(res, 503, { error: "static_not_active" });
        return;
      }
      sendJson(res, 200, {
        staticVersionId: state.status.staticVersionId,
        lines: state.lines,
      });
      return;
    }
    if (req.method === "GET" && path === "/internal/catalog/stations") {
      if (!state.status.staticVersionId) {
        sendJson(res, 503, { error: "static_not_active" });
        return;
      }
      sendJson(res, 200, {
        staticVersionId: state.status.staticVersionId,
        stations: state.stations,
      });
      return;
    }
    sendJson(res, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("stub data server failed to bind");
  }
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

export async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}
