#!/usr/bin/env node

import {
  lstatSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(scriptDir, "../..");
const SCAN_CLASS = "public-copy-named-competitor-claims";
const METHODOLOGY_CONTRACTS = Object.freeze([
  {
    path: "benchmarks/README.md",
    markers: [
      "# BetterMTA Benchmarks",
      "QA-owned corpus, invariant runner, and release gates.",
    ],
  },
  {
    path: "benchmarks/docs/HUMAN_REVIEW.md",
    markers: [
      "# Human Review Workflow",
      "## Checklist (per itinerary / top result)",
      "## External comparison rules",
    ],
  },
  {
    path: "benchmarks/docs/CI_QUALITY_GATES.md",
    markers: [
      "# CI Quality Gates (Benchmark / QA)",
      "## Merge-blocking invariant classes",
      "## Step 3 release checklist (20 gates)",
    ],
  },
]);
const METHODOLOGY_FILES = Object.freeze(
  METHODOLOGY_CONTRACTS.map((contract) => contract.path),
);
const PUBLIC_SURFACES = Object.freeze([
  "apps/web/src",
  "docs/public-beta/LIMITATIONS.md",
]);
const CANONICAL_NONCLAIM_FILES = Object.freeze([
  "docs/public-beta/LIMITATIONS.md",
  "apps/web/src/app/limitations/page.tsx",
]);
const NAMED_COMPETITOR_SOURCE =
  "(?:Google\\s+Maps|Apple\\s+Maps|Citymapper|MTA|Metropolitan\\s+Transportation\\s+Authority)";
const NAMED_COMPETITOR = new RegExp(`\\b(?:the\\s+)?${NAMED_COMPETITOR_SOURCE}\\b`, "i");
const EXPLICIT_NONCLAIM_SOURCE = `\\b(?:does\\s+not|doesn['’]t|do\\s+not|don['’]t|never)\\s+claim(?:s)?\\s+(?:to\\s+)?(?:beat|outperform|be\\s+better\\s+than|be\\s+superior\\s+to)\\s+(?:the\\s+)?${NAMED_COMPETITOR_SOURCE}(?:\\s*,?\\s+(?:the\\s+)?${NAMED_COMPETITOR_SOURCE})*(?:\\s*,?\\s+(?:or\\s+)?(?:another|any\\s+other)\\s+product)?`;
const EXPLICIT_NONCLAIM = new RegExp(EXPLICIT_NONCLAIM_SOURCE, "i");
const EXPLICIT_NONCLAIM_GLOBAL = new RegExp(EXPLICIT_NONCLAIM_SOURCE, "gi");
const ALLOWED_INTERNAL_REFERENCE = /~(?:N|\$\{[^}]+\}|\d+)\s+min\s+faster\s+than\s+fastest\s+baseline|next\/font\/google/i;
const SAFE_NEUTRAL_COPY_PATTERNS = [
  /\bsubway\s+schedule\s+and\s+realtime\s+data\s+provided\s+by\s+the\s+Metropolitan\s+Transportation\s+Authority\s*\(\s*MTA\s*\)\.(?:\s+BetterMTA\s+is\s+not\s+affiliated\s+with\s+or\s+endorsed\s+by\s+the\s+MTA\.)?/gi,
  /\bBetterMTA\s+is\s+not\s+affiliated\s+with\s+or\s+endorsed\s+by\s+(?:the\s+)?(?:Metropolitan\s+Transportation\s+Authority|MTA)\./gi,
  /\bWalking,\s+transfers,\s+service\s+changes,\s+station\s+access,\s+and\s+elevator\s+conditions\s+can\s+change;\s+confirm\s+critical\s+accessibility\s+needs\s+and\s+urgent\s+service\s+conditions\s+with\s+official\s+MTA\s+information\./gi,
  /\bConfirm\s+critical\s+accessibility\s+needs\s+and\s+urgent\s+service\s+conditions\s+with\s+official\s+MTA\s+information,\s+and\s+follow\s+station\s+staff,\s+posted\s+signs,\s+alerts,\s+and\s+emergency\s+instructions\s+when\s+they\s+conflict\s+with\s+an\s+app\s+result\./gi,
  /\bExisting\s+line\s+badges\s+use\s+inline\s+CSS\s+custom\s+properties\s+for\s+MTA\s+colors\./gi,
  /\bCanonical\s+MTA\s+gray\s+for\s+the\s+42\s+St\s+Shuttle\s+when\s+catalog\s+omits\s+GS\./gi,
];
const RENDERED_NONCLAIM_SOURCE =
  "BetterMTA\\s+does(?:\\s+not|n['’]t)\\s+claim\\s+to\\s+beat\\s+Google\\s+Maps,\\s*Apple\\s+Maps,\\s*Citymapper,\\s*the\\s+MTA,\\s*or\\s+another\\s+product\\.";
const RENDERED_NONCLAIM = new RegExp(
  `<p>\\s*${RENDERED_NONCLAIM_SOURCE}`,
  "i",
);
const INVALID_LIMITATIONS_PAGE_STRUCTURE =
  "invalid_limitations_page_structure";

class ScanFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function fail(code, exitCode) {
  process.stderr.write(`ERROR ${code}\n`);
  process.exitCode = exitCode;
}

function parseArgs(args) {
  if (args.length === 0) return { repoRoot: defaultRepoRoot };
  if (
    args.length !== 2 ||
    args[0] !== "--repo-root" ||
    args[1].length === 0 ||
    /[\u0000-\u001f\u007f]/.test(args[1])
  ) {
    return null;
  }
  return { repoRoot: resolve(args[1]) };
}

function collectFiles(root) {
  const files = [];
  const entries = readdirSync(root, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  for (const entry of entries) {
    const absolutePath = resolve(root, entry.name);
    if (entry.isSymbolicLink()) {
      throw new ScanFailure("symlink_in_public_surface");
    }
    if (entry.isDirectory()) {
      files.push(...collectFiles(absolutePath));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    } else {
      throw new ScanFailure("invalid_repository");
    }
  }
  return files;
}

function statPathWithoutFollowingLinks(repoRoot, relativePath, symlinkCode) {
  let currentPath = resolve(repoRoot);
  let currentStat;
  try {
    currentStat = lstatSync(currentPath);
  } catch {
    return null;
  }
  if (currentStat.isSymbolicLink()) throw new ScanFailure(symlinkCode);

  for (const segment of relativePath.split("/")) {
    currentPath = resolve(currentPath, segment);
    try {
      currentStat = lstatSync(currentPath);
    } catch {
      return null;
    }
    if (currentStat.isSymbolicLink()) throw new ScanFailure(symlinkCode);
  }
  return currentStat;
}

function hasStatementBoundary(text, start) {
  const prefix = text.slice(0, start).trimEnd();
  if (prefix.length === 0) return true;
  const previous = prefix.at(-1);
  if (/[.!?;,:<>{}[\]()]/.test(previous)) return true;
  const linePrefix = prefix.slice(prefix.lastIndexOf("\n") + 1).trim();
  return linePrefix === "//" || /^\/\*+$/.test(linePrefix);
}

function removeSafeNeutralCopy(text) {
  return SAFE_NEUTRAL_COPY_PATTERNS.reduce(
    (remaining, pattern) =>
      remaining.replace(pattern, (match, offset, source) =>
        hasStatementBoundary(source, offset) ? " " : match,
      ),
    text,
  );
}

function isUnsupportedNamedStatement(text) {
  const normalized = text.replace(/[ \t\r\f\v]+/g, " ");
  const safeText = removeSafeNeutralCopy(normalized)
    .replace(EXPLICIT_NONCLAIM_GLOBAL, " ")
    .replace(ALLOWED_INTERNAL_REFERENCE, " ");
  return NAMED_COMPETITOR.test(safeText);
}

function stripSourceComments(source) {
  let output = "";
  let quote = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quote) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (
      (char === "'" && /[A-Za-z0-9_$]/.test(source[index - 1] ?? "")) ||
      char === '"' ||
      char === "`"
    ) {
      quote = char;
      output += char;
      continue;
    }

    if (char === "/" && next === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") index += 1;
      output += "\n";
      index -= 1;
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === "*" && source[index + 1] === "/")
      ) {
        if (source[index] === "\n") output += "\n";
        index += 1;
      }
      if (index < source.length) index += 1;
      output += " ";
      continue;
    }

    output += char;
  }
  return output;
}

function isSourceQuoteStart(source, index) {
  const char = source[index];
  if (char === '"' || char === "`") return true;
  return char === "'" && !/[A-Za-z0-9_$]/.test(source[index - 1] ?? "");
}

function skipSourceQuote(source, start) {
  const quote = source[start];
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === quote) {
      return index + 1;
    }
  }
  return source.length;
}

function skipSourceComment(source, start) {
  if (source[start] !== "/") return start;
  if (source[start + 1] === "/") {
    const newline = source.indexOf("\n", start + 2);
    return newline < 0 ? source.length : newline;
  }
  if (source[start + 1] === "*") {
    const end = source.indexOf("*/", start + 2);
    return end < 0 ? source.length : end + 2;
  }
  return start;
}

function findMatchingDelimiter(source, openIndex, open, close) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const commentEnd = skipSourceComment(source, index);
    if (commentEnd !== index) {
      index = commentEnd - 1;
      continue;
    }
    if (isSourceQuoteStart(source, index)) {
      index = skipSourceQuote(source, index) - 1;
      continue;
    }
    if (source[index] === open) {
      depth += 1;
    } else if (source[index] === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function maskNonExecutableSource(source) {
  const masked = source.split("");
  const maskRange = (start, end) => {
    for (let index = start; index < end; index += 1) {
      if (source[index] !== "\n" && source[index] !== "\r") masked[index] = " ";
    }
  };

  for (let index = 0; index < source.length; index += 1) {
    const commentEnd = skipSourceComment(source, index);
    if (commentEnd !== index) {
      maskRange(index, commentEnd);
      index = commentEnd - 1;
      continue;
    }
    if (isSourceQuoteStart(source, index)) {
      const quoteEnd = skipSourceQuote(source, index);
      maskRange(index, quoteEnd);
      index = quoteEnd - 1;
    }
  }
  return masked.join("");
}

function extractLimitationsPageReturnedJsx(source) {
  const executableSource = maskNonExecutableSource(source);
  const signature = /export\s+default\s+function\s+LimitationsPage\b/.exec(
    executableSource,
  );
  if (!signature) return { error: INVALID_LIMITATIONS_PAGE_STRUCTURE };
  const bodyStart = executableSource.indexOf("{", signature.index);
  if (bodyStart < 0) return { error: INVALID_LIMITATIONS_PAGE_STRUCTURE };
  const bodyEnd = findMatchingDelimiter(source, bodyStart, "{", "}");
  if (bodyEnd < 0) return { error: INVALID_LIMITATIONS_PAGE_STRUCTURE };

  let braceDepth = 0;
  let returnCount = 0;
  let returnedJsx = null;
  let returnShapeInvalid = false;
  for (let index = bodyStart + 1; index < bodyEnd; index += 1) {
    const commentEnd = skipSourceComment(source, index);
    if (commentEnd !== index) {
      index = commentEnd - 1;
      continue;
    }
    if (isSourceQuoteStart(source, index)) {
      index = skipSourceQuote(source, index) - 1;
      continue;
    }
    if (source[index] === "{") {
      braceDepth += 1;
      continue;
    }
    if (source[index] === "}") {
      braceDepth -= 1;
      continue;
    }
    if (
      source.startsWith("return", index) &&
      !/[A-Za-z0-9_$]/.test(source[index - 1] ?? "") &&
      !/[A-Za-z0-9_$]/.test(source[index + "return".length] ?? "")
    ) {
      returnCount += 1;
      let expressionStart = index + "return".length;
      while (/\s/.test(source[expressionStart] ?? "")) expressionStart += 1;
      if (returnCount === 1) {
        if (source[expressionStart] !== "(") {
          returnShapeInvalid = true;
          continue;
        }
        const expressionEnd = findMatchingDelimiter(
          source,
          expressionStart,
          "(",
          ")",
        );
        if (expressionEnd < 0) {
          returnShapeInvalid = true;
          continue;
        }
        returnedJsx = source.slice(expressionStart + 1, expressionEnd);
        index = expressionEnd;
        continue;
      }
    }
  }

  if (returnCount !== 1 || returnShapeInvalid || returnedJsx === null) {
    return { error: INVALID_LIMITATIONS_PAGE_STRUCTURE };
  }
  return { jsx: returnedJsx };
}

function hasCanonicalNonclaim(relativePath, text) {
  if (relativePath === "apps/web/src/app/limitations/page.tsx") {
    const returned = extractLimitationsPageReturnedJsx(text);
    if (returned.error) return returned.error;
    return RENDERED_NONCLAIM.test(stripSourceComments(returned.jsx))
      ? "present"
      : "missing_explicit_public_nonclaim";
  }
  return EXPLICIT_NONCLAIM.test(text)
    ? "present"
    : "missing_explicit_public_nonclaim";
}

function validateMethodology(repoRoot) {
  for (const contract of METHODOLOGY_CONTRACTS) {
    const absolutePath = resolve(repoRoot, contract.path);
    let fileStat;
    try {
      fileStat = statPathWithoutFollowingLinks(
        repoRoot,
        contract.path,
        "symlink_in_methodology_contract",
      );
    } catch (error) {
      if (error instanceof ScanFailure) return error.code;
      return "invalid_methodology_contract";
    }
    if (!fileStat) return "missing_methodology_contract";
    if (!fileStat.isFile() || fileStat.size === 0) {
      return "invalid_methodology_contract";
    }
    let text;
    try {
      text = readFileSync(absolutePath, "utf8");
    } catch {
      return "invalid_methodology_contract";
    }
    if (contract.markers.some((marker) => !text.includes(marker))) {
      return "invalid_methodology_contract";
    }
  }
  return null;
}

function scan(repoRoot) {
  const surfaceFiles = [];
  for (const surface of PUBLIC_SURFACES) {
    const absolutePath = resolve(repoRoot, surface);
    let surfaceStat;
    try {
      surfaceStat = statPathWithoutFollowingLinks(
        repoRoot,
        surface,
        "symlink_in_public_surface",
      );
    } catch (error) {
      if (error instanceof ScanFailure) throw error;
      return { error: "invalid_repository" };
    }
    if (!surfaceStat) return { error: "invalid_repository" };
    if (surfaceStat.isDirectory()) {
      surfaceFiles.push(...collectFiles(absolutePath));
    } else if (surfaceStat.isFile()) {
      surfaceFiles.push(absolutePath);
    } else {
      return { error: "invalid_repository" };
    }
  }

  const methodologyError = validateMethodology(repoRoot);
  if (methodologyError) {
    return { error: methodologyError };
  }

  let nonClaimCopyPresent = false;
  let prohibitedMatches = 0;
  const surfaceTexts = new Map();
  for (const absolutePath of surfaceFiles) {
    const text = readFileSync(absolutePath, "utf8");
    surfaceTexts.set(absolutePath, text);
  }

  let canonicalNonclaimError = null;
  nonClaimCopyPresent = CANONICAL_NONCLAIM_FILES.every((relativePath) => {
    const text = surfaceTexts.get(resolve(repoRoot, relativePath));
    const status = text
      ? hasCanonicalNonclaim(relativePath, text)
      : "missing_explicit_public_nonclaim";
    if (status !== "present") canonicalNonclaimError ??= status;
    return status === "present";
  });
  if (!nonClaimCopyPresent) {
    return {
      error: canonicalNonclaimError ?? "missing_explicit_public_nonclaim",
    };
  }

  for (const text of surfaceTexts.values()) {
    if (isUnsupportedNamedStatement(text)) prohibitedMatches += 1;
  }

  if (prohibitedMatches > 0) {
    return { error: "prohibited_named_competitor_claim" };
  }
  return {
    schemaVersion: 1,
    status: "PASS",
    scanClass: SCAN_CLASS,
    filesScanned: surfaceFiles.length,
    prohibitedMatches: 0,
    nonClaimCopyPresent: true,
    methodologyFiles: [...METHODOLOGY_FILES],
    generatedAt: new Date().toISOString(),
  };
}

const options = parseArgs(process.argv.slice(2));
if (!options) {
  fail("invalid_arguments", 2);
} else {
  try {
    const result = scan(options.repoRoot);
    if (result.error) {
      fail(result.error, result.error === "prohibited_named_competitor_claim" ? 1 : 2);
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    const code = error instanceof ScanFailure ? error.code : "invalid_repository";
    fail(code, code === "prohibited_named_competitor_claim" ? 1 : 2);
  }
}
