import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  STATIC_ATTRIBUTION,
  STATIC_LICENSE_NOTE,
} from "./config.js";

export interface VersionMetadata {
  versionId: string;
  sha256: string;
  sourceUrl: string;
  fetchedAt: string;
  byteSize: number;
  serviceDateRange: { startDate: string; endDate: string } | null;
  tableCounts: Record<string, number>;
  attribution: string;
  licenseNote: string;
}

export interface ActivePointer {
  versionId: string;
  sha256: string;
  activatedAt: string;
}

export interface VersionStorePaths {
  root: string;
  versionsDir: string;
  activePath: string;
  graphBuildRequestPath: string;
  tempDir: string;
}

export function staticStorePaths(dataDir: string): VersionStorePaths {
  const root = join(dataDir, "static");
  return {
    root,
    versionsDir: join(root, "versions"),
    activePath: join(root, "active.json"),
    graphBuildRequestPath: join(root, "graph-build-request.json"),
    tempDir: join(root, "tmp"),
  };
}

export type AtomicWriteFn = (targetPath: string, contents: string) => void;

export const defaultAtomicWrite: AtomicWriteFn = (targetPath, contents) => {
  const dir = join(targetPath, "..");
  mkdirSync(dir, { recursive: true });
  const tmp = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, targetPath);
};

/**
 * Persist extracted tables + metadata under versions/<versionId>/.
 * Does not activate.
 */
export function storeVersionDataset(options: {
  dataDir: string;
  extractDir: string;
  metadata: VersionMetadata;
  tableFiles?: string[];
}): string {
  const paths = staticStorePaths(options.dataDir);
  mkdirSync(paths.versionsDir, { recursive: true });
  const versionDir = join(paths.versionsDir, options.metadata.versionId);
  mkdirSync(versionDir, { recursive: true });

  const files =
    options.tableFiles ??
    readdirSync(options.extractDir).filter((f) => f.endsWith(".txt"));

  for (const file of files) {
    const src = join(options.extractDir, file);
    if (existsSync(src)) {
      copyFileSync(src, join(versionDir, file));
    }
  }

  writeFileSync(
    join(versionDir, "metadata.json"),
    JSON.stringify(
      {
        ...options.metadata,
        attribution: options.metadata.attribution || STATIC_ATTRIBUTION,
        licenseNote: options.metadata.licenseNote || STATIC_LICENSE_NOTE,
      },
      null,
      2,
    ),
    "utf8",
  );

  return versionDir;
}

export function readActivePointer(dataDir: string): ActivePointer | null {
  const { activePath } = staticStorePaths(dataDir);
  if (!existsSync(activePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(activePath, "utf8")) as ActivePointer;
    if (!raw.versionId || !raw.sha256) return null;
    return raw;
  } catch {
    return null;
  }
}

export function readVersionMetadata(
  dataDir: string,
  versionId: string,
): VersionMetadata | null {
  const path = join(
    staticStorePaths(dataDir).versionsDir,
    versionId,
    "metadata.json",
  );
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as VersionMetadata;
  } catch {
    return null;
  }
}

export function versionDir(dataDir: string, versionId: string): string {
  return join(staticStorePaths(dataDir).versionsDir, versionId);
}

/**
 * Atomic activation: write active.json via temp + rename.
 */
export function activateVersion(
  dataDir: string,
  pointer: ActivePointer,
  atomicWrite: AtomicWriteFn = defaultAtomicWrite,
): void {
  const { activePath, root } = staticStorePaths(dataDir);
  mkdirSync(root, { recursive: true });
  const dir = versionDir(dataDir, pointer.versionId);
  if (!existsSync(dir)) {
    throw new Error(`Cannot activate missing version dir: ${pointer.versionId}`);
  }
  if (!existsSync(join(dir, "metadata.json"))) {
    throw new Error(`Cannot activate version without metadata: ${pointer.versionId}`);
  }
  atomicWrite(activePath, JSON.stringify(pointer, null, 2));
}

export function listRetainedVersions(dataDir: string): string[] {
  const { versionsDir } = staticStorePaths(dataDir);
  if (!existsSync(versionsDir)) return [];
  return readdirSync(versionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/**
 * Keep the last N versions (by metadata fetchedAt, falling back to name).
 * Never deletes the currently active version.
 */
export function pruneVersions(
  dataDir: string,
  retain: number,
  activeVersionId: string | null,
): string[] {
  const versions = listRetainedVersions(dataDir);
  const decorated = versions.map((id) => {
    const meta = readVersionMetadata(dataDir, id);
    return { id, fetchedAt: meta?.fetchedAt ?? "" };
  });
  decorated.sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt));
  const removed: string[] = [];
  while (decorated.length > retain) {
    const oldest = decorated[0]!;
    if (oldest.id === activeVersionId) {
      // move active to end so we prune others first
      decorated.push(decorated.shift()!);
      // if somehow all remaining are active-only, stop
      if (decorated.every((d) => d.id === activeVersionId)) break;
      continue;
    }
    decorated.shift();
    const dir = versionDir(dataDir, oldest.id);
    rmSync(dir, { recursive: true, force: true });
    removed.push(oldest.id);
  }
  return removed;
}
