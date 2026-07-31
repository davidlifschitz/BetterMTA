import AdmZip from "adm-zip";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Required core GTFS tables (transfers optional; calendar OR calendar_dates). */
export const CORE_REQUIRED_TABLES = [
  "agency.txt",
  "routes.txt",
  "stops.txt",
  "trips.txt",
  "stop_times.txt",
] as const;

export interface ExtractedGtfsZip {
  /** Absolute directory containing extracted .txt tables. */
  extractDir: string;
  /** Filenames present in the archive (basename). */
  entryNames: string[];
  /** Tables written to extractDir. */
  writtenFiles: string[];
}

export class ZipIntegrityError extends Error {
  readonly code: string;
  constructor(message: string, code = "ZIP_INTEGRITY") {
    super(message);
    this.name = "ZipIntegrityError";
    this.code = code;
  }
}

/**
 * Full central-directory read + extraction of required GTFS tables.
 * Truncated/corrupt zips fail hard.
 * Writes transfers.txt / calendar.txt stubs when optional/absent so the
 * existing StaticImporter parser can load the directory.
 */
export async function extractGtfsZip(
  zipPath: string,
  extractDir: string,
): Promise<ExtractedGtfsZip> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipPath);
  } catch (err) {
    throw new ZipIntegrityError(
      `Corrupt or truncated ZIP: ${err instanceof Error ? err.message : String(err)}`,
      "ZIP_CORRUPT",
    );
  }

  let entries: AdmZip.IZipEntry[];
  try {
    entries = zip.getEntries();
  } catch (err) {
    throw new ZipIntegrityError(
      `Failed to read ZIP central directory: ${err instanceof Error ? err.message : String(err)}`,
      "ZIP_CENTRAL_DIRECTORY",
    );
  }

  if (!entries || entries.length === 0) {
    throw new ZipIntegrityError("ZIP has no entries", "ZIP_EMPTY");
  }

  const byBase = new Map<string, AdmZip.IZipEntry>();
  const entryNames: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const base = entry.entryName.split("/").pop() ?? entry.entryName;
    entryNames.push(base);
    if (!byBase.has(base) || !entry.entryName.includes("/")) {
      byBase.set(base, entry);
    }
    try {
      entry.getData();
    } catch (err) {
      throw new ZipIntegrityError(
        `Failed to inflate ${entry.entryName}: ${err instanceof Error ? err.message : String(err)}`,
        "ZIP_INFLATE",
      );
    }
  }

  for (const required of CORE_REQUIRED_TABLES) {
    if (!byBase.has(required)) {
      throw new ZipIntegrityError(
        `Missing required GTFS file: ${required}`,
        "MISSING_REQUIRED",
      );
    }
  }

  const hasCalendar = byBase.has("calendar.txt");
  const hasCalendarDates = byBase.has("calendar_dates.txt");
  if (!hasCalendar && !hasCalendarDates) {
    throw new ZipIntegrityError(
      "Missing calendar.txt and calendar_dates.txt (need at least one)",
      "MISSING_CALENDAR",
    );
  }

  await mkdir(extractDir, { recursive: true });

  const toWrite = new Set<string>([
    ...CORE_REQUIRED_TABLES,
    ...(hasCalendar ? ["calendar.txt"] : []),
    ...(hasCalendarDates ? ["calendar_dates.txt"] : []),
    ...(byBase.has("transfers.txt") ? ["transfers.txt"] : []),
  ]);

  const writtenFiles: string[] = [];
  for (const name of toWrite) {
    const entry = byBase.get(name)!;
    let data: Buffer;
    try {
      data = entry.getData();
    } catch (err) {
      throw new ZipIntegrityError(
        `Failed to extract ${name}: ${err instanceof Error ? err.message : String(err)}`,
        "ZIP_INFLATE",
      );
    }
    await writeFile(join(extractDir, name), data);
    writtenFiles.push(name);
  }

  // Existing parser requires transfers.txt + calendar.txt — normalize
  if (!byBase.has("transfers.txt")) {
    await writeFile(
      join(extractDir, "transfers.txt"),
      "from_stop_id,to_stop_id,transfer_type,min_transfer_time\n",
    );
    writtenFiles.push("transfers.txt");
  }
  if (!hasCalendar) {
    await writeFile(
      join(extractDir, "calendar.txt"),
      "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n",
    );
    writtenFiles.push("calendar.txt");
  }

  return { extractDir, entryNames, writtenFiles };
}
