import { mkdirSync } from "node:fs";
import {
  defaultAtomicWrite,
  staticStorePaths,
  type AtomicWriteFn,
} from "./version-store.js";
import { sanitizeUrl, type Logger, defaultLogger } from "./log.js";

export interface GraphBuildRequest {
  versionId: string;
  sha256: string;
  requestedAt: string;
}

export interface GraphBuildTrigger {
  onNewVersionActivated(request: GraphBuildRequest): Promise<void>;
}

export interface DefaultTriggerOptions {
  dataDir: string;
  webhookUrl?: string | null;
  atomicWrite?: AtomicWriteFn;
  fetchFn?: typeof fetch;
  logger?: Logger;
}

/**
 * Default trigger: atomically write graph-build-request.json and optionally POST webhook.
 */
export class DefaultGraphBuildTrigger implements GraphBuildTrigger {
  private readonly dataDir: string;
  private readonly webhookUrl: string | null;
  private readonly atomicWrite: AtomicWriteFn;
  private readonly fetchFn: typeof fetch;
  private readonly logger: Logger;

  constructor(options: DefaultTriggerOptions) {
    this.dataDir = options.dataDir;
    this.webhookUrl = options.webhookUrl ?? null;
    this.atomicWrite = options.atomicWrite ?? defaultAtomicWrite;
    this.fetchFn = options.fetchFn ?? fetch;
    this.logger = options.logger ?? defaultLogger;
  }

  async onNewVersionActivated(request: GraphBuildRequest): Promise<void> {
    const paths = staticStorePaths(this.dataDir);
    mkdirSync(paths.root, { recursive: true });
    this.atomicWrite(
      paths.graphBuildRequestPath,
      JSON.stringify(request, null, 2),
    );
    this.logger("info", "Graph-build request written", {
      stage: "graph-build-trigger",
      versionId: request.versionId,
      sha256: request.sha256,
    });

    if (this.webhookUrl) {
      const safe = sanitizeUrl(this.webhookUrl);
      try {
        const res = await this.fetchFn(this.webhookUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
        });
        if (!res.ok) {
          this.logger("warn", "Graph-build webhook non-OK", {
            stage: "graph-build-trigger",
            webhook: safe,
            status: res.status,
          });
        } else {
          this.logger("info", "Graph-build webhook posted", {
            stage: "graph-build-trigger",
            webhook: safe,
          });
        }
      } catch (err) {
        this.logger("warn", "Graph-build webhook failed", {
          stage: "graph-build-trigger",
          webhook: safe,
          errorCode: err instanceof Error ? err.name : "unknown",
        });
      }
    }
  }
}

export class RecordingGraphBuildTrigger implements GraphBuildTrigger {
  readonly requests: GraphBuildRequest[] = [];
  async onNewVersionActivated(request: GraphBuildRequest): Promise<void> {
    this.requests.push(request);
  }
}
