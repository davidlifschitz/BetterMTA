import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { sanitizeUrl, type Logger, defaultLogger } from "./log.js";

export interface DownloadResult {
  tempFilePath: string;
  byteSize: number;
  contentType: string | null;
  sourceUrl: string;
}

export interface DownloadOptions {
  url: string;
  /** Directory for temp download (not under versions/). */
  tempDir: string;
  maxBytes: number;
  timeoutMs: number;
  /** Injected fetch for tests. */
  fetchFn?: typeof fetch;
  logger?: Logger;
}

const ZIP_CONTENT_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "binary/octet-stream",
]);

function isAllowedContentType(ct: string | null): boolean {
  if (!ct) return true;
  const base = ct.split(";")[0]!.trim().toLowerCase();
  return ZIP_CONTENT_TYPES.has(base);
}

export class DownloadError extends Error {
  readonly code: string;
  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = "DownloadError";
    this.code = code;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

async function downloadFromFilesystem(
  pathOrFileUrl: string,
  tempFilePath: string,
  maxBytes: number,
): Promise<DownloadResult> {
  const path = pathOrFileUrl.startsWith("file:")
    ? new URL(pathOrFileUrl).pathname
    : pathOrFileUrl;
  const buf = await readFile(path);
  if (buf.byteLength > maxBytes) {
    throw new DownloadError(
      `File exceeds max bytes (${maxBytes})`,
      "SIZE_CAP",
    );
  }
  const partial = `${tempFilePath}.partial`;
  const { writeFile } = await import("node:fs/promises");
  await writeFile(partial, buf);
  await rename(partial, tempFilePath);
  return {
    tempFilePath,
    byteSize: buf.byteLength,
    contentType: "application/zip",
    sourceUrl: pathOrFileUrl,
  };
}

/**
 * Download GTFS zip to a temp file with timeout + byte cap.
 * Never writes into the versions directory.
 */
export async function downloadStaticGtfsZip(
  options: DownloadOptions,
): Promise<DownloadResult> {
  const logger = options.logger ?? defaultLogger;
  const safeUrl = sanitizeUrl(options.url);
  await mkdir(options.tempDir, { recursive: true });
  const tempFilePath = join(
    options.tempDir,
    `gtfs-download-${process.pid}-${Date.now()}.zip`,
  );

  if (
    options.url.startsWith("file:") ||
    options.url.startsWith("/") ||
    /^[.]{1,2}\//.test(options.url)
  ) {
    logger("info", "Downloading static GTFS from local source", {
      stage: "download",
      source: safeUrl,
    });
    return downloadFromFilesystem(options.url, tempFilePath, options.maxBytes);
  }

  const fetchFn = options.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const partialPath = `${tempFilePath}.partial`;

  try {
    logger("info", "Downloading static GTFS", {
      stage: "download",
      source: safeUrl,
    });
    const res = await fetchFn(options.url, { signal: controller.signal });
    if (!res.ok) {
      throw new DownloadError(
        `HTTP ${res.status} downloading static GTFS`,
        "HTTP_ERROR",
      );
    }
    const contentType = res.headers.get("content-type");
    if (!isAllowedContentType(contentType)) {
      throw new DownloadError(
        `Unexpected content-type: ${contentType}`,
        "CONTENT_TYPE",
      );
    }

    const contentLength = res.headers.get("content-length");
    if (contentLength && Number(contentLength) > options.maxBytes) {
      throw new DownloadError(
        `Content-Length ${contentLength} exceeds max bytes`,
        "SIZE_CAP",
      );
    }

    if (!res.body) {
      throw new DownloadError("Empty response body", "EMPTY_BODY");
    }

    let downloaded = 0;
    const nodeReadable = Readable.fromWeb(
      res.body as import("node:stream/web").ReadableStream,
    );

    const capped = new Readable({
      read() {
        /* pull from source via pipe */
      },
    });

    // Stream with byte cap: wrap source
    const source = Readable.from(
      (async function* () {
        for await (const chunk of nodeReadable) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          downloaded += buf.byteLength;
          if (downloaded > options.maxBytes) {
            controller.abort();
            throw new DownloadError(
              `Download exceeded max bytes (${options.maxBytes})`,
              "SIZE_CAP",
            );
          }
          yield buf;
        }
      })(),
    );

    void capped;
    await pipeline(source, createWriteStream(partialPath));
    await rename(partialPath, tempFilePath);

    logger("info", "Static GTFS download complete", {
      stage: "download",
      bytes: downloaded,
      source: safeUrl,
    });

    return {
      tempFilePath,
      byteSize: downloaded,
      contentType,
      sourceUrl: options.url,
    };
  } catch (err) {
    await removeTempFile(tempFilePath);
    await removeTempFile(partialPath);

    if (err instanceof DownloadError) throw err;

    if (
      err instanceof Error &&
      (err.name === "AbortError" ||
        err.message.includes("aborted") ||
        controller.signal.aborted)
    ) {
      throw new DownloadError("Download timed out", "TIMEOUT", err);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function removeTempFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    /* ignore */
  }
}
