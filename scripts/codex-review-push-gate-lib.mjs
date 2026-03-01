#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export const ZERO_SHA = "0000000000000000000000000000000000000000";

const SEVERITY_RANK = {
  none: 0,
  minor: 1,
  major: 2,
  blocker: 3,
};

export const REVIEW_DISMISSALS_SCHEMA_VERSION = 1;
export const REVIEWED_SHAS_SCHEMA_VERSION = 2;

function normalizeSeverity(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "minor" || raw === "major" || raw === "blocker") return raw;
  return "none";
}

export function severityRank(value) {
  const normalized = normalizeSeverity(value);
  return SEVERITY_RANK[normalized] ?? 0;
}

export function parseMinSeverity(value) {
  const raw = String(value ?? "minor")
    .trim()
    .toLowerCase();
  if (
    raw === "none" ||
    raw === "minor" ||
    raw === "major" ||
    raw === "blocker"
  ) {
    return raw;
  }
  return "minor";
}

export function parseRefUpdates(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) => line.split(/\s+/))
    .filter((parts) => parts.length >= 4)
    .map(([localRef, localSha, remoteRef, remoteSha]) => ({
      localRef,
      localSha,
      remoteRef,
      remoteSha,
    }));
}

function parseLines(raw) {
  return String(raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function defaultGitExec(args, repoRoot) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function branchNameFromLocalRef(localRef) {
  const ref = String(localRef ?? "").trim();
  if (!ref.startsWith("refs/heads/")) return "";
  return ref.slice("refs/heads/".length).trim();
}

function collectOutgoingByUpdate({ updates, remoteName = "", gitExec }) {
  const seen = new Set();
  const orderedShas = [];
  const shaBranches = new Map();

  const remoteRefs =
    remoteName && remoteName.trim()
      ? parseLines(
          gitExec([
            "for-each-ref",
            "--format=%(refname)",
            `refs/remotes/${remoteName}/*`,
          ]),
        )
      : [];

  for (const update of updates) {
    if (!update.localRef || !update.localRef.startsWith("refs/heads/"))
      continue;
    if (update.localSha === ZERO_SHA) continue;
    const branchName = branchNameFromLocalRef(update.localRef);

    let revArgs;
    if (update.remoteSha === ZERO_SHA) {
      if (remoteRefs.length > 0) {
        revArgs = [
          "rev-list",
          "--reverse",
          update.localSha,
          "--not",
          ...remoteRefs,
        ];
      } else {
        const localRefs = parseLines(
          gitExec(["for-each-ref", "--format=%(refname)", "refs/heads"]),
        ).filter((ref) => ref !== update.localRef);

        revArgs = ["rev-list", "--reverse", update.localSha];
        if (localRefs.length > 0) {
          revArgs.push("--not", ...localRefs);
        }
      }
    } else {
      revArgs = [
        "rev-list",
        "--reverse",
        `${update.remoteSha}..${update.localSha}`,
      ];
    }

    const revOutput = parseLines(gitExec(revArgs));
    for (const sha of revOutput) {
      if (!seen.has(sha)) {
        seen.add(sha);
        orderedShas.push(sha);
      }
      if (!branchName) continue;
      const branches = shaBranches.get(sha) ?? new Set();
      branches.add(branchName);
      shaBranches.set(sha, branches);
    }
  }

  return { orderedShas, shaBranches };
}

export function computeOutgoingShas({ updates, remoteName = "", gitExec }) {
  return collectOutgoingByUpdate({ updates, remoteName, gitExec }).orderedShas;
}

export function isReviewProcessRunningForSha(sha, processListText) {
  if (!sha) return false;
  const escapedSha = sha.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withShaPattern = new RegExp(
    `codex-review-commit[^\\n]*--sha\\s+${escapedSha}|--sha\\s+${escapedSha}[^\\n]*codex-review-commit`,
    "i",
  );
  return withShaPattern.test(String(processListText ?? ""));
}

function isPidAlive(pidRaw) {
  const pid = Number.parseInt(String(pidRaw ?? ""), 10);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseProcessTable(processTableText) {
  const map = new Map();
  const lines = String(processTableText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const match = /^(\d+)\s+(.+)$/.exec(line);
    if (!match) continue;
    map.set(match[1], match[2]);
  }
  return map;
}

export function classifyReviewProcessCommandForSha(command, sha) {
  const value = String(command ?? "");
  if (!value || !sha) return "inconclusive";
  if (!/codex-review-commit/i.test(value)) return "mismatch";
  if (!/--sha\b/i.test(value)) return "inconclusive";

  const escapedSha = sha.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withShaPattern = new RegExp(
    `codex-review-commit[^\\n]*--sha\\s+${escapedSha}|--sha\\s+${escapedSha}[^\\n]*codex-review-commit`,
    "i",
  );
  if (withShaPattern.test(value)) return "match";
  return "inconclusive";
}

async function hasActiveReviewLockForSha({
  reviewsDir,
  sha,
  processTable = new Map(),
  readFileFn = readFile,
}) {
  if (!sha) return false;
  const ownerPath = path.join(reviewsDir, `${sha}.review.lock`, "owner");
  const rawOwner = await readFileFn(ownerPath, "utf8").catch(() => "");
  if (!rawOwner) return false;

  const pidLine = rawOwner
    .split(/\r?\n/)
    .find((line) => String(line ?? "").startsWith("pid="));
  const pid = String((pidLine ?? "").slice(4).trim());
  if (!pid) return false;
  if (!isPidAlive(pid)) return false;

  const command = processTable.get(pid);
  const classification = classifyReviewProcessCommandForSha(command, sha);
  return classification !== "mismatch";
}

function snapshotProcessTable() {
  const attempts = [
    ["-axww", "-o", "pid=,command="],
    ["-axo", "pid=,command="],
  ];
  for (const args of attempts) {
    const ps = spawnSync("ps", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (ps.status !== 0) continue;
    const processTableText = String(ps.stdout ?? "");
    const processTable = parseProcessTable(processTableText);
    return {
      available: true,
      processTableText,
      processTable,
    };
  }
  return {
    available: false,
    processTableText: "",
    processTable: new Map(),
  };
}

const IN_PROGRESS_PATTERNS = [
  /\.patch\./,
  /\.prompt\./,
  /\.tmp-json\./,
  /\.tmp-json-lm\./,
  /\.tmp-local-model-used\./,
  /\.tmp-md\./,
  /\.tmp-status-/,
  /\.tmp-reason-/,
  /\.tmp-attempts-/,
  /\.tmp\./,
];

export const DEFAULT_IN_PROGRESS_STALE_MS = 10 * 60 * 1000;

export function hasInProgressArtifactsForSha(sha, fileNames) {
  const prefix = `${sha}.`;
  return fileNames.some((name) => {
    if (!name.startsWith(prefix)) return false;
    return IN_PROGRESS_PATTERNS.some((pattern) => pattern.test(name));
  });
}

function parseNonNegativeInt(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function resolveInProgressStaleMs() {
  const fromEnv = parseNonNegativeInt(
    process.env.CODEX_REVIEW_IN_PROGRESS_STALE_SECONDS,
  );
  if (fromEnv !== null) {
    return fromEnv * 1000;
  }
  return DEFAULT_IN_PROGRESS_STALE_MS;
}

export async function hasFreshInProgressArtifactsForSha({
  reviewsDir,
  sha,
  staleAfterMs = DEFAULT_IN_PROGRESS_STALE_MS,
  nowMs = Date.now(),
  readdirFn = readdir,
  statFn = stat,
}) {
  const fileNames = await readdirFn(reviewsDir).catch(() => []);
  const prefix = `${sha}.`;
  const matching = fileNames.filter((name) => {
    if (!name.startsWith(prefix)) return false;
    return IN_PROGRESS_PATTERNS.some((pattern) => pattern.test(name));
  });

  for (const name of matching) {
    const fullPath = path.join(reviewsDir, name);
    const info = await statFn(fullPath).catch(() => null);
    if (!info || !Number.isFinite(info.mtimeMs)) continue;
    if (nowMs - info.mtimeMs <= staleAfterMs) {
      return true;
    }
  }

  return false;
}

export async function defaultIsReviewInProgress({ reviewsDir, sha }) {
  const snapshot = snapshotProcessTable();
  const processTable = snapshot.processTable;
  const processTableText = snapshot.processTableText;
  const processListText = Array.from(processTable.values()).join("\n");
  if (isReviewProcessRunningForSha(sha, processListText)) {
    return true;
  }

  const hasFreshArtifacts = await hasFreshInProgressArtifactsForSha({
    reviewsDir,
    sha,
    staleAfterMs: resolveInProgressStaleMs(),
  });
  if (!hasFreshArtifacts) return false;

  // If ps output is unavailable, preserve conservative behavior and treat
  // fresh temp artifacts as in-progress.
  if (!snapshot.available) {
    return true;
  }

  // Fresh temp files can outlive crashed reviewers. Use lock owner checks to
  // avoid waiting on dead artifacts forever, while treating inconclusive
  // command inspection as active to avoid deleting/live-review false negatives.
  return hasActiveReviewLockForSha({
    reviewsDir,
    sha,
    processTable,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForReviewToSettle({
  reviewsDir,
  sha,
  timeoutMs,
  pollMs = 1000,
  isReviewInProgress = defaultIsReviewInProgress,
  sleepFn = sleep,
}) {
  const deadline = Date.now() + timeoutMs;
  let waited = false;

  while (true) {
    const inProgress = await isReviewInProgress({ reviewsDir, sha });
    if (!inProgress) {
      return { waited, timedOut: false };
    }
    if (Date.now() >= deadline) {
      return { waited, timedOut: true };
    }
    waited = true;
    await sleepFn(pollMs);
  }
}

function summarizeFindings(findings) {
  const normalizedFindings = Array.isArray(findings) ? findings : [];
  let worst = "none";
  for (const finding of normalizedFindings) {
    const severity = normalizeSeverity(finding?.severity);
    if (severityRank(severity) > severityRank(worst)) {
      worst = severity;
    }
  }
  return {
    count: normalizedFindings.length,
    worstSeverity: worst,
  };
}

function normalizeFindingToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function parseReviewedPayload(parsed) {
  const reviewed = Array.isArray(parsed?.reviewed) ? parsed.reviewed : [];
  const any = new Set();
  const clean = new Set();
  for (const entry of reviewed) {
    const legacySha = typeof entry === "string" ? entry : "";
    const sha = String((entry?.sha ?? legacySha) || "").trim();
    if (!sha) continue;
    any.add(sha);
    const status = normalizeFindingToken(entry?.status);
    if (status === "clean") {
      clean.add(sha);
    }
  }
  return { any, clean };
}

export function findingSignature(finding) {
  return [
    normalizeFindingToken(finding?.key),
    normalizeFindingToken(finding?.id),
    normalizeFindingToken(finding?.title),
    normalizeFindingToken(finding?.severity),
    normalizeFindingToken(finding?.file),
    Number.isInteger(finding?.start) ? String(finding.start) : "",
    Number.isInteger(finding?.end) ? String(finding.end) : "",
  ].join("|");
}

function sanitizeBranchName(branchName) {
  const trimmed = String(branchName ?? "").trim();
  if (!trimmed || trimmed === "HEAD") return "detached";
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function resolveDismissalsPath(repoRoot, branchName) {
  const branchFile = `${sanitizeBranchName(branchName)}.json`;
  return path.join(repoRoot, ".git", "codex-review", "dismissals", branchFile);
}

function resolveBranchReviewedShasPath(repoRoot, branchName) {
  const branchFile = `${sanitizeBranchName(branchName)}.json`;
  return path.join(repoRoot, ".git", "codex-review", "reviewed", branchFile);
}

function resolveReviewedShasPath(repoRoot) {
  return path.join(repoRoot, ".git", "codex-review", "reviewed", "global.json");
}

export async function loadDismissedFindingSignatures({
  repoRoot,
  branchName,
  readFileFn = readFile,
}) {
  const dismissalsPath = resolveDismissalsPath(repoRoot, branchName);
  let parsed;
  try {
    const raw = await readFileFn(dismissalsPath, "utf8");
    parsed = JSON.parse(raw);
  } catch {
    return new Map();
  }

  const dismissed = Array.isArray(parsed?.dismissed) ? parsed.dismissed : [];
  const map = new Map();
  for (const entry of dismissed) {
    const sha = String(entry?.sha ?? "").trim();
    const signature = normalizeFindingToken(entry?.signature);
    if (!sha || !signature) continue;
    const set = map.get(sha) ?? new Set();
    set.add(signature);
    map.set(sha, set);
  }
  return map;
}

export async function loadReviewedShas({
  repoRoot,
  branchName = "",
  readFileFn = readFile,
}) {
  const globalReviewed = {
    any: new Set(),
    clean: new Set(),
  };
  const reviewedPath = resolveReviewedShasPath(repoRoot);
  try {
    const raw = await readFileFn(reviewedPath, "utf8");
    const parsed = JSON.parse(raw);
    const parsedReviewed = parseReviewedPayload(parsed);
    for (const sha of parsedReviewed.any) globalReviewed.any.add(sha);
    for (const sha of parsedReviewed.clean) globalReviewed.clean.add(sha);
  } catch {}

  if (branchName) {
    const legacyBranchPath = resolveBranchReviewedShasPath(
      repoRoot,
      branchName,
    );
    try {
      const raw = await readFileFn(legacyBranchPath, "utf8");
      const parsed = JSON.parse(raw);
      const parsedReviewed = parseReviewedPayload(parsed);
      for (const sha of parsedReviewed.any) globalReviewed.any.add(sha);
      for (const sha of parsedReviewed.clean) globalReviewed.clean.add(sha);
    } catch {}
  }

  return globalReviewed;
}

export async function saveReviewedShas({
  repoRoot,
  reviewedAnyShas,
  reviewedCleanShas,
  mkdirFn = mkdir,
  readFileFn = readFile,
  openFn = open,
  renameFn = rename,
  unlinkFn = unlink,
  writeFileFn = writeFile,
}) {
  const reviewedPath = resolveReviewedShasPath(repoRoot);
  await mkdirFn(path.dirname(reviewedPath), { recursive: true });
  const lockPath = `${reviewedPath}.lock`;
  const lockDeadlineMs = Date.now() + 5000;
  let lockHandle = null;
  while (!lockHandle) {
    try {
      lockHandle = await openFn(lockPath, "wx");
    } catch {
      if (Date.now() >= lockDeadlineMs) {
        throw new Error("timed out waiting for reviewed ledger lock");
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  try {
    const allShas = new Set(reviewedAnyShas ?? reviewedCleanShas ?? []);
    const cleanShas = new Set(reviewedCleanShas ?? []);
    for (const sha of cleanShas) {
      allShas.add(sha);
    }

    try {
      const existingRaw = await readFileFn(reviewedPath, "utf8");
      const existing = parseReviewedPayload(JSON.parse(existingRaw));
      for (const sha of existing.any) allShas.add(sha);
      for (const sha of existing.clean) {
        allShas.add(sha);
        cleanShas.add(sha);
      }
    } catch {}

    const reviewed = Array.from(allShas)
      .sort()
      .map((sha) => ({
        sha,
        status: cleanShas.has(sha) ? "clean" : "reviewed",
      }));
    const payload = {
      schema_version: REVIEWED_SHAS_SCHEMA_VERSION,
      scope: "global",
      reviewed,
      updated_at: new Date().toISOString(),
    };
    const tempPath = `${reviewedPath}.tmp.${process.pid}.${Date.now()}`;
    await writeFileFn(
      tempPath,
      `${JSON.stringify(payload, null, 2)}\n`,
      "utf8",
    );
    await renameFn(tempPath, reviewedPath);
  } finally {
    try {
      await lockHandle?.close();
    } catch {}
    await unlinkFn(lockPath).catch(() => {});
  }
}

export async function readReviewGateState({
  reviewsDir,
  sha,
  minSeverity,
  requireLocalModel = false,
  dismissedSignatures = new Set(),
}) {
  const jsonPath = path.join(reviewsDir, `${sha}.json`);
  const threshold = parseMinSeverity(minSeverity);

  let parsed;
  try {
    const raw = await readFile(jsonPath, "utf8");
    parsed = JSON.parse(raw);
  } catch {
    return {
      sha,
      status: "missing",
      reason: "missing-or-invalid-json",
      reviewStatus: "",
      failureReason: "",
      findingsCount: 0,
      worstSeverity: "none",
      actionable: false,
      failed: false,
      blocking: false,
      hasCodexReview: false,
      hasLocalReview: false,
      missingRequiredReviews: requireLocalModel,
      localReviewStatus: "missing",
      hasReportArtifact: false,
    };
  }

  const reviewStatus = String(parsed?.review_status ?? "").trim().toLowerCase();
  const failureReason = String(parsed?.failure_reason ?? "").trim().toLowerCase();
  const codexReviewStatus = String(parsed?.review_engines?.codex?.status ?? "");
  const localReviewStatus = String(parsed?.review_engines?.local?.status ?? "");
  const normalizedCodexStatus = codexReviewStatus.trim().toLowerCase();
  const inferredCodexOkFromReviewStatus =
    reviewStatus === "ok" || reviewStatus === "partial_success";
  const hasCodexReview =
    normalizedCodexStatus.length > 0
      ? normalizedCodexStatus === "ok"
      : inferredCodexOkFromReviewStatus;
  const failed = !hasCodexReview;
  const findings = Array.isArray(parsed?.findings) ? parsed.findings : [];
  const unresolvedFindings = findings.filter(
    (finding) =>
      !dismissedSignatures.has(
        normalizeFindingToken(findingSignature(finding)),
      ),
  );
  const { count, worstSeverity } = summarizeFindings(unresolvedFindings);
  const actionable = failed || count > 0;
  const blocking =
    failed ||
    (count > 0 && severityRank(worstSeverity) >= severityRank(threshold));
  const hasLocalReview = localReviewStatus === "ok";
  const missingRequiredReviews = requireLocalModel && !hasLocalReview;

  return {
    sha,
    status: "present",
    reason: "report-present",
    reviewStatus,
    failureReason,
    findingsCount: count,
    worstSeverity,
    actionable,
    failed,
    blocking,
    hasCodexReview,
    hasLocalReview,
    missingRequiredReviews,
    localReviewStatus,
    hasReportArtifact: true,
  };
}

export function defaultEnsureCodexReady() {
  const hasCodex = spawnSync(
    "sh",
    ["-lc", "command -v codex >/dev/null 2>&1"],
    {
      stdio: "ignore",
    },
  );
  if (hasCodex.status !== 0) {
    return { ok: false, message: "codex CLI is not available in PATH" };
  }

  const auth = spawnSync("codex", ["login", "status"], {
    stdio: "ignore",
  });
  if (auth.status !== 0) {
    return {
      ok: false,
      message: "codex is not authenticated (run: codex login)",
    };
  }

  return { ok: true, message: "ok" };
}

export function defaultRunSyncReview({ repoRoot, sha }) {
  const scriptPath = path.join(repoRoot, "scripts", "codex-review-commit");
  const allowLocalModel =
    (process.env.CODEX_REVIEW_PUSH_GATE_SYNC_ALLOW_LOCAL_MODEL ?? "0").trim() ===
    "1";
  const syncTimeoutSeconds = String(
    process.env.CODEX_REVIEW_PUSH_GATE_SYNC_TIMEOUT_SECONDS ??
      process.env.CODEX_REVIEW_TIMEOUT_SECONDS ??
      "300",
  ).trim();
  const syncMaxAttempts = String(
    process.env.CODEX_REVIEW_PUSH_GATE_SYNC_MAX_ATTEMPTS ??
      process.env.CODEX_REVIEW_MAX_ATTEMPTS ??
      "1",
  ).trim();
  const syncDedupeLockTimeoutSeconds = String(
    process.env.CODEX_REVIEW_PUSH_GATE_SYNC_DEDUPE_LOCK_TIMEOUT_SECONDS ??
      process.env.CODEX_REVIEW_DEDUPE_LOCK_TIMEOUT_SECONDS ??
      "90",
  ).trim();
  const syncDedupeStaleSeconds = String(
    process.env.CODEX_REVIEW_PUSH_GATE_SYNC_DEDUPE_STALE_SECONDS ??
      process.env.CODEX_REVIEW_DEDUPE_STALE_SECONDS ??
      "60",
  ).trim();
  const syncDedupeOwnerlessStaleSeconds = String(
    process.env.CODEX_REVIEW_PUSH_GATE_SYNC_DEDUPE_OWNERLESS_STALE_SECONDS ??
      process.env.CODEX_REVIEW_DEDUPE_OWNERLESS_STALE_SECONDS ??
      "15",
  ).trim();
  const result = spawnSync(scriptPath, ["--sha", sha, "--trigger", "manual"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      CODEX_REVIEW_OLLAMA_ENABLED: allowLocalModel ? "1" : "0",
      CODEX_REVIEW_TIMEOUT_SECONDS: syncTimeoutSeconds,
      CODEX_REVIEW_MAX_ATTEMPTS: syncMaxAttempts,
      CODEX_REVIEW_DEDUPE_LOCK_TIMEOUT_SECONDS: syncDedupeLockTimeoutSeconds,
      CODEX_REVIEW_DEDUPE_STALE_SECONDS: syncDedupeStaleSeconds,
      CODEX_REVIEW_DEDUPE_OWNERLESS_STALE_SECONDS:
        syncDedupeOwnerlessStaleSeconds,
    },
  });
  return {
    ok: result.status === 0,
    code: result.status ?? 1,
  };
}

function defaultShouldContinue() {
  return true;
}

export async function executePushGate({
  repoRoot,
  reviewsDir,
  stdinText,
  remoteName = "",
  minSeverity = "minor",
  timeoutMs = 900000,
  syncMissing = true,
  syncCanRepairMissingLocal = false,
  computeOutgoing = computeOutgoingShas,
  gitExec,
  waitForReview = waitForReviewToSettle,
  readReviewState = readReviewGateState,
  ensureCodexReady = defaultEnsureCodexReady,
  runSyncReview = defaultRunSyncReview,
  requireLocalModel = false,
  shouldContinue = defaultShouldContinue,
}) {
  const updates = parseRefUpdates(stdinText);
  const usingDefaultOutgoing = computeOutgoing === computeOutgoingShas;
  const collected = usingDefaultOutgoing
    ? collectOutgoingByUpdate({ updates, remoteName, gitExec })
    : null;
  const shas = collected
    ? collected.orderedShas
    : computeOutgoing({ updates, remoteName, gitExec });
  const shaBranches = collected?.shaBranches ?? new Map();
  let headBranchName = "HEAD";
  try {
    headBranchName =
      String(gitExec(["rev-parse", "--abbrev-ref", "HEAD"]) ?? "").trim() ||
      "HEAD";
  } catch {
    headBranchName = "HEAD";
  }

  const branchStateCache = new Map();
  const reviewedBranchScopes = new Set([headBranchName]);
  for (const branches of shaBranches.values()) {
    for (const branchName of branches) {
      reviewedBranchScopes.add(branchName);
    }
  }
  const reviewedShas = { any: new Set(), clean: new Set() };
  for (const branchName of reviewedBranchScopes) {
    const scopedReviewed = await loadReviewedShas({
      repoRoot,
      branchName,
    });
    for (const sha of scopedReviewed.any) reviewedShas.any.add(sha);
    for (const sha of scopedReviewed.clean) reviewedShas.clean.add(sha);
  }
  const reviewedAnyShas = new Set(reviewedShas.any);
  const reviewedCleanShas = new Set(reviewedShas.clean);
  let reviewedShasDirty = false;
  const pushTipShas = new Set(
    updates
      .filter(
        (update) =>
          update.localRef?.startsWith("refs/heads/") &&
          update.localSha !== ZERO_SHA,
      )
      .map((update) => update.localSha),
  );
  if (pushTipShas.size === 0) {
    for (const sha of shas) pushTipShas.add(sha);
  }

  const getBranchState = async (branchName) => {
    const scopedBranchName =
      String(branchName || headBranchName).trim() || "HEAD";
    const cached = branchStateCache.get(scopedBranchName);
    if (cached) return cached;
    const dismissedBySha = await loadDismissedFindingSignatures({
      repoRoot,
      branchName: scopedBranchName,
    });
    const entry = {
      branchName: scopedBranchName,
      dismissedBySha,
    };
    branchStateCache.set(scopedBranchName, entry);
    return entry;
  };

  const getScopeBranchesForSha = (sha) => {
    const scoped = shaBranches.get(sha);
    if (scoped && scoped.size > 0) return Array.from(scoped);
    return [headBranchName];
  };

  let runningWaited = 0;
  let syncReruns = 0;
  let actionable = 0;
  let failed = 0;
  const blocked = [];

  let codexReady = null;

  for (const sha of shas) {
    if (!shouldContinue()) {
      break;
    }

    // Only evaluate pushed tip SHAs. Older outgoing commits are superseded by tip state.
    if (!pushTipShas.has(sha)) {
      continue;
    }

    // When local-model coverage is required, always inspect the report directly.
    if (!requireLocalModel && reviewedCleanShas.has(sha)) {
      continue;
    }

    const waitResult = await waitForReview({
      reviewsDir,
      sha,
      timeoutMs,
    });
    if (waitResult.waited) {
      runningWaited += 1;
    }

    const scopeBranches = getScopeBranchesForSha(sha);
    const branchStates = await Promise.all(
      scopeBranches.map((branchName) => getBranchState(branchName)),
    );
    const dismissedSignatures = new Set();
    for (const branchState of branchStates) {
      const scopedDismissals = branchState.dismissedBySha.get(sha);
      if (!scopedDismissals) continue;
      for (const signature of scopedDismissals) {
        dismissedSignatures.add(signature);
      }
    }

    let state = await readReviewState({
      reviewsDir,
      sha,
      minSeverity,
      requireLocalModel,
      dismissedSignatures,
    });

    if (waitResult.timedOut && !syncMissing) {
      blocked.push({
        sha,
        status: "in-progress",
        severity: "none",
        findings: 0,
        reason: "review-in-progress",
      });
      continue;
    }

    const hasCleanReviewedEvidence = reviewedCleanShas.has(sha);
    const canBypassWithCleanLedger =
      hasCleanReviewedEvidence && !requireLocalModel;
    const needsSync =
      syncMissing &&
      (!state.hasReportArtifact ||
        (state.missingRequiredReviews && syncCanRepairMissingLocal)) &&
      !canBypassWithCleanLedger;
    if (needsSync) {
      if (!shouldContinue()) {
        break;
      }

      if (!codexReady || !codexReady.ok) {
        codexReady = ensureCodexReady();
      }
      if (!codexReady.ok) {
        blocked.push({
          sha,
          status: "runner-unavailable",
          severity: "none",
          findings: 0,
          reason: codexReady.message,
        });
        continue;
      }

      const runResult = runSyncReview({ repoRoot, sha });
      syncReruns += 1;
      if (!runResult.ok) {
        blocked.push({
          sha,
          status: "sync-review-failed",
          severity: "none",
          findings: 0,
          reason: `sync review command failed (exit ${runResult.code})`,
        });
        continue;
      }

      state = await readReviewState({
        reviewsDir,
        sha,
        minSeverity,
        requireLocalModel,
        dismissedSignatures,
      });
    }

    if (!state.hasReportArtifact && canBypassWithCleanLedger) {
      continue;
    }

    if (!state.hasReportArtifact || state.missingRequiredReviews) {
      const reason = !state.hasReportArtifact
        ? waitResult.timedOut
          ? "review-in-progress"
          : "review-report-missing"
        : "local-review-missing";
      blocked.push({
        sha,
        status: !state.hasReportArtifact
          ? waitResult.timedOut
            ? "in-progress"
            : state.status || "missing-review"
          : state.localReviewStatus || "missing-local-review",
        severity: "none",
        findings: state.findingsCount ?? 0,
        reason,
      });
      continue;
    }

    if (!reviewedAnyShas.has(sha)) {
      reviewedAnyShas.add(sha);
      reviewedShasDirty = true;
    }

    if (state.actionable) actionable += 1;
    if (state.failed) failed += 1;
    if (!state.blocking && !reviewedCleanShas.has(sha)) {
      reviewedCleanShas.add(sha);
      reviewedShasDirty = true;
    }

    if (state.blocking) {
      blocked.push({
        sha,
        status: state.reviewStatus || "unknown",
        severity: state.worstSeverity,
        findings: state.findingsCount,
        reason: state.failed
          ? state.failureReason
            ? `review-status-${state.failureReason}`
            : "review-status-failed"
          : `severity-threshold-${parseMinSeverity(minSeverity)}`,
      });
      continue;
    }
  }

  if (reviewedShasDirty) {
    try {
      await saveReviewedShas({
        repoRoot,
        reviewedAnyShas,
        reviewedCleanShas,
      });
    } catch {
      // Best-effort persistence only; never fail pushes on sidecar state writes.
    }
  }

  return {
    shas,
    summary: {
      shas: shas.length,
      running_waited: runningWaited,
      sync_reruns: syncReruns,
      actionable,
      failed,
      blocked: blocked.length,
    },
    blocked,
  };
}
