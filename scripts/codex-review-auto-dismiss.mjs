#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = { stdinFile: "", repoRoot: process.cwd() };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--stdin-file":
        args.stdinFile = String(next ?? "");
        i += 1;
        break;
      case "--repo-root":
        args.repoRoot = String(next ?? process.cwd());
        i += 1;
        break;
      case "-h":
      case "--help":
        console.log("Usage: node scripts/codex-review-auto-dismiss.mjs --stdin-file <path> [--repo-root <path>]");
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.stdinFile) {
    throw new Error("--stdin-file is required");
  }

  return args;
}

function parseRefUpdates(text) {
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

function git(repoRoot, args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function hasTrackedFile(repoRoot, filePath) {
  try {
    const out = git(repoRoot, ["ls-files", "--", filePath]);
    return out === filePath;
  } catch {
    return false;
  }
}

function readReviewJson(repoRoot, sha) {
  const reviewPath = path.join(repoRoot, ".codex", "reviews", `${sha}.json`);
  if (!existsSync(reviewPath)) return null;
  try {
    return JSON.parse(readFileSync(reviewPath, "utf8"));
  } catch {
    return null;
  }
}

function shouldDismissPnpmRemoval({ repoRoot, finding }) {
  const id = String(finding?.finding_id ?? "").trim();
  const title = String(finding?.title ?? "").toLowerCase();
  if (
    id !== "F-pnpm-lockfile-removed" &&
    !title.includes("pnpm") &&
    !title.includes("lockfile")
  ) {
    return false;
  }

  const evidence = Array.isArray(finding?.evidence) ? finding.evidence : [];
  const touchesPnpmLock = evidence.some((entry) => String(entry?.file ?? "") === "pnpm-lock.yaml");
  if (!touchesPnpmLock) return false;

  return hasTrackedFile(repoRoot, "package-lock.json");
}

function dismissFinding(repoRoot, sha, index) {
  const dismissScript = path.join(repoRoot, "scripts", "codex-review-dismiss-finding");
  execFileSync(dismissScript, ["--sha", sha, "--index", String(index)], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
}

function main() {
  const { stdinFile, repoRoot } = parseArgs(process.argv);
  const stdinText = readFileSync(stdinFile, "utf8");
  const updates = parseRefUpdates(stdinText);

  const candidateShas = new Set();
  for (const update of updates) {
    if (!String(update.localRef).startsWith("refs/heads/")) continue;
    if (!/^[0-9a-f]{40}$/i.test(String(update.localSha))) continue;
    if (/^0{40}$/.test(String(update.localSha))) continue;
    candidateShas.add(String(update.localSha));
  }

  for (const sha of candidateShas) {
    const review = readReviewJson(repoRoot, sha);
    if (!review || !Array.isArray(review.findings)) continue;

    for (let i = 0; i < review.findings.length; i += 1) {
      const finding = review.findings[i];
      if (!shouldDismissPnpmRemoval({ repoRoot, finding })) continue;
      // Gate expects 1-based index for dismiss command.
      dismissFinding(repoRoot, sha, i + 1);
    }
  }
}

try {
  main();
} catch {
  // Non-fatal: auto-dismiss should never block push flow.
  process.exit(0);
}
