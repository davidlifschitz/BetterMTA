#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  lstat,
  mkdir,
  readdir,
  realpath,
  open,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildEvidence,
  validateProbe,
} from "./write-load-readiness-evidence.mjs";

const scriptDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const probeScript = join(scriptDir, "load-route-search.mjs");
const writerScript = join(scriptDir, "write-load-readiness-evidence.mjs");
const RELEASE_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const MAX_CHILD_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 1024 * 1024;
const RESTORATION_PATH_ERRORS = new Set(["ENOTDIR", "ELOOP", "ENOTEMPTY"]);
let runInProgress = false;
const TEST_FAILURES = new Set([
  "probe",
  "writer",
  "validation",
  "write",
  "publication",
  "after-probe",
  "before-result",
  "after-result",
]);

function fail(code) {
  console.error(`ERROR ${code}`);
  process.exitCode = 2;
}

function takeValue(args, index) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error("missing value");
  return value;
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--release-commit") {
      if (options.releaseCommit) throw new Error("duplicate commit");
      options.releaseCommit = takeValue(args, index);
      index += 1;
    } else if (flag === "--output-dir") {
      if (options.outputDir) throw new Error("duplicate output");
      options.outputDir = takeValue(args, index);
      index += 1;
    } else {
      throw new Error("unknown option");
    }
  }
  if (!RELEASE_COMMIT_PATTERN.test(options.releaseCommit ?? "")) throw new Error("invalid commit");
  if (
    !isAbsolute(options.outputDir ?? "") ||
    /[\u0000-\u001f\u007f]/.test(options.outputDir) ||
    options.outputDir.split("/").includes("..")
  ) {
    throw new Error("invalid output directory");
  }
  return options;
}

function sameIdentity(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino;
}

function currentCwdIdentity() {
  const cwdPath = (() => {
    try {
      return process.cwd();
    } catch {
      return "";
    }
  })();
  const cwdFd = openSync(".", "r");
  try {
    return { cwdPath, details: fstatSync(cwdFd) };
  } finally {
    closeSync(cwdFd);
  }
}

function ensureAnchorCwd(context) {
  let current;
  let anchoredDetails;
  try {
    current = currentCwdIdentity();
    anchoredDetails = fstatSync(context.parentHandle.fd);
    if (
      sameIdentity(current.details, context.parentIdentity) &&
      sameIdentity(anchoredDetails, context.parentIdentity)
    ) {
      return;
    }
  } catch {
    // Attempt one fixed-anchor recovery below.
  }

  try {
    const anchorDetails = lstatSync(context.parentRealPath);
    if (!anchorDetails.isDirectory() || !sameIdentity(anchorDetails, context.parentIdentity)) {
      throw new Error("synthetic runner cwd changed");
    }
    process.chdir(context.parentRealPath);
    current = currentCwdIdentity();
    anchoredDetails = fstatSync(context.parentHandle.fd);
    if (
      !sameIdentity(current.details, context.parentIdentity) ||
      !sameIdentity(anchoredDetails, context.parentIdentity)
    ) {
      throw new Error("synthetic runner cwd changed");
    }
  } catch {
    throw new Error("synthetic runner cwd changed");
  }
}

async function prepareOutputEntry(outputName) {
  let details;
  try {
    details = await lstat(outputName);
  } catch (error) {
    if (error?.code !== "ENOENT") throw new Error("invalid output directory");
    try {
      await mkdir(outputName);
      details = await lstat(outputName);
    } catch {
      throw new Error("invalid output directory");
    }
  }
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error("invalid output directory");
  }
  try {
    if ((await readdir(outputName)).length !== 0) {
      throw new Error("output directory is not empty");
    }
  } catch (error) {
    if (error?.message === "output directory is not empty") throw error;
    throw new Error("invalid output directory");
  }
}

function assertAnchoredParentStable(context) {
  let currentRealPath;
  let currentDetails;
  let anchoredDetails;
  try {
    currentRealPath = realpathSync(context.parentPath);
    currentDetails = lstatSync(currentRealPath);
    anchoredDetails = fstatSync(context.parentHandle.fd);
  } catch {
    throw new Error("synthetic output parent changed");
  }
  if (
    currentRealPath !== context.parentRealPath ||
    !currentDetails.isDirectory() ||
    !sameIdentity(currentDetails, context.parentIdentity) ||
    !sameIdentity(anchoredDetails, context.parentIdentity)
  ) {
    throw new Error("synthetic output parent changed");
  }
}

async function anchorOutputDirectory(outputDir) {
  const outputPath = resolve(outputDir);
  const parentPath = dirname(outputPath);
  const outputName = basename(outputPath);
  if (!outputName || outputName === "." || outputName === "..") {
    throw new Error("invalid output directory");
  }
  let parentHandle = null;
  try {
    await mkdir(parentPath, { recursive: true });
    const parentRealPath = await realpath(parentPath);
    const parentDetails = await lstat(parentRealPath);
    if (!parentDetails.isDirectory() || parentDetails.isSymbolicLink()) {
      throw new Error("invalid output directory");
    }
    parentHandle = await open(parentRealPath, "r");
    const parentIdentity = await parentHandle.stat();
    const originalCwd = process.cwd();
    const originalCwdRealPath = realpathSync(originalCwd);
    const originalCwdIdentity = currentCwdIdentity().details;
    try {
      process.chdir(parentRealPath);
      await prepareOutputEntry(outputName);
      const context = {
        outputName,
        outputPath,
        parentPath,
        parentRealPath,
        parentHandle,
        parentIdentity,
        originalCwd,
        originalCwdRealPath,
        originalCwdIdentity,
      };
      assertAnchoredParentStable(context);
      return context;
    } catch (error) {
      try {
        process.chdir(originalCwd);
      } catch {
        // Keep the fixed primary error if the original cwd is unavailable.
      }
      try {
        await parentHandle.close();
        parentHandle = null;
      } catch {
        // Keep the fixed primary error if the parent handle cannot close.
      }
      throw error?.message === "output directory is not empty" ||
        error?.message === "synthetic output parent changed"
        ? error
        : new Error("invalid output directory");
    }
  } catch (error) {
    if (parentHandle) {
      try {
        await parentHandle.close();
      } catch {
        // Keep the fixed primary error if the parent handle cannot close.
      }
    }
    if (
      error?.message === "output directory is not empty" ||
      error?.message === "synthetic output parent changed"
    ) {
      throw error;
    }
    throw new Error("invalid output directory");
  }
}

function startFixture() {
  const server = createServer((request, response) => {
    let bodyBytes = 0;
    request.on("data", (chunk) => {
      bodyBytes += chunk.length;
      if (bodyBytes > 1024 * 1024) request.destroy();
    });
    request.on("end", () => {
      if (request.method === "GET" && request.url === "/v1/status") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          contractVersion: "2026-07-31",
          dataMode: "synthetic",
          staticDatasetVersion: "synthetic-runner-v1",
          realtimeSnapshotId: "synthetic-runner-rt-v1",
          realtimeAgeSeconds: 0,
          degraded: false,
          messages: [],
        }));
        return;
      }
      if (request.method === "POST" && request.url === "/v1/routes/search") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("{}");
        return;
      }
      response.writeHead(404, { "content-type": "application/json" });
      response.end("{}");
    });
  });
  return server;
}

function listen(server) {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        reject(new Error("fixture did not bind"));
        return;
      }
      resolveListen(address.port);
    });
  });
}

function close(server) {
  return new Promise((resolveClose) => {
    server.close(() => resolveClose());
  });
}

function runChild(script, args, cwd, timeoutMs = 30_000) {
  return new Promise((resolveChild) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let overLimit = false;
    const collect = (name) => (chunk) => {
      if (name === "stdout") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > MAX_CHILD_OUTPUT_BYTES) {
        overLimit = true;
        child.kill("SIGKILL");
      }
    };
    child.stdout.on("data", collect("stdout"));
    child.stderr.on("data", collect("stderr"));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("close", (code) => {
      clearTimeout(timer);
      resolveChild({ code: overLimit ? 99 : code, stdout, stderr });
    });
  });
}

function parseChildJson(result) {
  if (result.code !== 0 || result.stderr !== "") throw new Error("child failed");
  const lines = result.stdout.trim().split("\n");
  if (lines.length !== 1) throw new Error("child output malformed");
  return JSON.parse(lines[0]);
}

async function cleanStage(stageDir) {
  try {
    await rm(stageDir, { recursive: true, force: true });
  } catch {
    // Cleanup is best effort and must never replace the fixed primary error.
  }
}

function restoreEmptyOutputDirectory(outputDir) {
  const isEmptyRealDirectory = () => {
    try {
      const restoredDetails = lstatSync(outputDir);
      return (
        restoredDetails.isDirectory() &&
        !restoredDetails.isSymbolicLink() &&
        readdirSync(outputDir).length === 0
      );
    } catch {
      return false;
    }
  };

  let details;
  try {
    details = lstatSync(outputDir);
  } catch (error) {
    if (error?.code !== "ENOENT") return false;
    try {
      mkdirSync(outputDir);
      return isEmptyRealDirectory();
    } catch {
      return false;
    }
  }

  if (details.isDirectory() && !details.isSymbolicLink()) {
    try {
      if (readdirSync(outputDir).length === 0) return true;
    } catch {
      return false;
    }
  }

  const quarantine = `${outputDir}.quarantine-${randomUUID()}`;
  try {
    renameSync(outputDir, quarantine);
  } catch (error) {
    if (!RESTORATION_PATH_ERRORS.has(error?.code)) return false;
    try {
      const replacement = lstatSync(outputDir);
      if (replacement.isDirectory() && !replacement.isSymbolicLink()) return false;
      unlinkSync(outputDir);
    } catch {
      return false;
    }
    try {
      mkdirSync(outputDir);
      return isEmptyRealDirectory();
    } catch {
      return false;
    }
  }

  try {
    mkdirSync(outputDir);
  } catch {
    return false;
  }
  if (!isEmptyRealDirectory()) return false;

  try {
    rmSync(quarantine, { recursive: true, force: true });
    lstatSync(quarantine);
    return false;
  } catch (error) {
    return error?.code === "ENOENT" && isEmptyRealDirectory();
  }
}

function validateStage(stageDir, expectedCommit, canonicalProbe, canonicalResult) {
  try {
    const stageDetails = lstatSync(stageDir);
    if (!stageDetails.isDirectory() || stageDetails.isSymbolicLink()) {
      throw new Error("synthetic artifact inventory failed");
    }
    const entries = readdirSync(stageDir).sort();
    if (
      entries.length !== 2 ||
      entries[0] !== "probe.json" ||
      entries[1] !== "result.json"
    ) {
      throw new Error("synthetic artifact inventory failed");
    }
    for (const entry of entries) {
      const artifactPath = join(stageDir, entry);
      const details = lstatSync(artifactPath);
      if (
        !details.isFile() ||
        details.isSymbolicLink() ||
        details.size === 0 ||
        details.size > MAX_ARTIFACT_BYTES
      ) {
        throw new Error("synthetic artifact inventory failed");
      }
      const parsed = JSON.parse(readFileSync(artifactPath, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("synthetic artifact inventory failed");
      }
      if (entry === "probe.json") {
        validateProbe(parsed, expectedCommit);
        if (!isDeepStrictEqual(parsed, canonicalProbe)) {
          throw new Error("synthetic artifact inventory failed");
        }
      } else {
        const expectedResult = buildEvidence(
          canonicalProbe,
          expectedCommit,
          parsed.generatedAt,
        );
        if (
          !isDeepStrictEqual(parsed, canonicalResult) ||
          !isDeepStrictEqual(parsed, expectedResult)
        ) {
          throw new Error("synthetic artifact inventory failed");
        }
      }
    }
  } catch (error) {
    if (error?.message === "synthetic artifact inventory failed") throw error;
    throw new Error("synthetic artifact inventory failed");
  }
}

export async function runSyntheticLoad(
  options,
  { failureAt = "", beforePublish = null } = {},
) {
  if (runInProgress) {
    throw new Error("synthetic load runner already active");
  }
  runInProgress = true;
  let context = null;
  let stageDir = "";
  let server = null;
  let published = false;
  try {
    if (failureAt && !TEST_FAILURES.has(failureAt)) {
      throw new Error("invalid test failure injection");
    }
    if (beforePublish !== null && typeof beforePublish !== "function") {
      throw new Error("invalid test publication hook");
    }
    context = await anchorOutputDirectory(options.outputDir);
    ensureAnchorCwd(context);
    stageDir = `${context.outputName}.stage-${process.pid}-${randomUUID()}`;
    const stagedProbePath = join(stageDir, "probe.json");
    const stagedResultPath = join(stageDir, "result.json");
    const stagedProbeChildPath = join(context.parentRealPath, stagedProbePath);
    await mkdir(stageDir);
    ensureAnchorCwd(context);
    await realpath(stageDir);
    ensureAnchorCwd(context);
    if (failureAt === "probe") throw new Error("injected failure");
    server = startFixture();
    const port = await listen(server);
    ensureAnchorCwd(context);
    const probeResult = await runChild(probeScript, [
      "--base-url",
      `http://127.0.0.1:${port}`,
      "--release-commit",
      options.releaseCommit,
      "--requests",
      "100",
      "--concurrency",
      "5",
      "--warmup",
      "5",
      "--max-error-rate",
      "0",
    ], context.parentRealPath);
    ensureAnchorCwd(context);
    let probe;
    try {
      probe = parseChildJson(probeResult);
      validateProbe(probe, options.releaseCommit);
    } catch {
      throw new Error("synthetic probe failed");
    }
    if (probeResult.code !== 0) throw new Error("synthetic probe failed");
    const canonicalProbe = JSON.parse(JSON.stringify(probe));
    await writeFile(stagedProbePath, `${JSON.stringify(probe)}\n`, { flag: "wx" });
    ensureAnchorCwd(context);
    if (failureAt === "after-probe") throw new Error("injected failure");
    if (failureAt === "writer") throw new Error("injected failure");

    const writerResult = await runChild(writerScript, [
      "--probe",
      stagedProbeChildPath,
      "--release-commit",
      options.releaseCommit,
    ], context.parentRealPath);
    ensureAnchorCwd(context);
    let evidence;
    let canonicalResult;
    try {
      evidence = parseChildJson(writerResult);
      const expectedResult = buildEvidence(
        canonicalProbe,
        options.releaseCommit,
        evidence.generatedAt,
      );
      if (!isDeepStrictEqual(evidence, expectedResult)) {
        throw new Error("synthetic writer failed");
      }
      canonicalResult = JSON.parse(JSON.stringify(evidence));
    } catch {
      throw new Error("synthetic writer failed");
    }
    if (failureAt === "validation") throw new Error("injected failure");
    if (failureAt === "before-result") throw new Error("injected failure");
    if (failureAt === "write") throw new Error("injected failure");
    await writeFile(stagedResultPath, `${JSON.stringify(evidence)}\n`, { flag: "wx" });
    ensureAnchorCwd(context);
    if (failureAt === "after-result") throw new Error("injected failure");

    validateStage(stageDir, options.releaseCommit, canonicalProbe, canonicalResult);
    if (beforePublish) {
      await beforePublish({ outputDir: context.outputPath, stageDir });
    }
    ensureAnchorCwd(context);
    assertAnchoredParentStable(context);
    validateStage(stageDir, options.releaseCommit, canonicalProbe, canonicalResult);
    if (failureAt === "publication") throw new Error("injected failure");
    try {
      renameSync(stageDir, context.outputName);
    } catch {
      throw new Error("synthetic publication failed");
    }
    published = true;
  } finally {
    if (server) {
      try {
        await close(server);
      } catch {
        // Keep cleanup independent from fixture shutdown errors.
      }
    }
    let anchorReady = false;
    if (context) {
      try {
        ensureAnchorCwd(context);
        anchorReady = true;
      } catch {
        // Do not touch relative paths when the validated anchor is unavailable.
      }
    }
    if (context && !published && anchorReady) {
      await cleanStage(stageDir);
      try {
        ensureAnchorCwd(context);
        restoreEmptyOutputDirectory(context.outputName);
      } catch {
        // Cleanup and restoration remain independent fixed-failure steps.
      }
    }
    if (context) {
      try {
        await context.parentHandle.close();
      } catch {
        // Keep the fixed primary error if the parent handle cannot close.
      }
      try {
        process.chdir(context.originalCwd);
        const restoredCwd = currentCwdIdentity();
        if (!sameIdentity(restoredCwd.details, context.originalCwdIdentity)) {
          throw new Error("synthetic runner cwd restore failed");
        }
      } catch {
        // Keep the fixed primary error if the original cwd is unavailable.
      }
    }
    runInProgress = false;
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch {
    fail("invalid_arguments");
    return;
  }
  try {
    await runSyntheticLoad(options);
  } catch (error) {
    if (
      error?.message === "invalid output directory" ||
      error?.message === "output directory is not empty"
    ) {
      fail("invalid_arguments");
    } else {
      fail("synthetic_evidence_failed");
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
