import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export function parseMinSeverity(value) {
  const normalized = String(value ?? "minor").toLowerCase().trim();
  if (["none", "minor", "major", "blocker"].includes(normalized)) {
    return normalized;
  }
  return "minor";
}

function severityRank(severity) {
  if (severity === "blocker") return 3;
  if (severity === "major") return 2;
  if (severity === "minor") return 1;
  return 0;
}

export function defaultGitExec(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function parsePrePushUpdates(stdinText) {
  return String(stdinText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
      return { localRef, localSha, remoteRef, remoteSha };
    })
    .filter((entry) => entry.localSha && entry.remoteSha);
}

function isZeroSha(sha) {
  return /^0+$/.test(String(sha ?? ""));
}

export function collectPushedShas(updates, gitExec) {
  const shas = new Set();

  for (const update of updates) {
    if (isZeroSha(update.localSha)) {
      continue;
    }

    let revListArgs;
    if (isZeroSha(update.remoteSha)) {
      revListArgs = ["rev-list", update.localSha, "--not", "--all"];
    } else {
      revListArgs = ["rev-list", `${update.remoteSha}..${update.localSha}`];
    }

    const revList = gitExec(revListArgs);
    if (revList.status === 0) {
      const listed = revList.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (listed.length === 0) {
        shas.add(update.localSha);
      } else {
        for (const sha of listed) shas.add(sha);
      }
    } else {
      shas.add(update.localSha);
    }
  }

  return [...shas];
}

async function readReviewReport(path) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function runSyncReview({ repoRoot, sha }) {
  const result = spawnSync("scripts/codex-review-commit", ["--sha", sha, "--trigger", "manual"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return result.status === 0;
}

export async function executePushGate({
  repoRoot,
  reviewsDir,
  stdinText,
  minSeverity,
  syncMissing,
  gitExec,
}) {
  const updates = parsePrePushUpdates(stdinText);
  const shas = collectPushedShas(updates, gitExec);

  const threshold = parseMinSeverity(minSeverity);
  const thresholdRank = severityRank(threshold);

  const blocked = [];
  const details = [];

  for (const sha of shas) {
    const reportPath = join(reviewsDir, `${sha}.json`);
    let report = await readReviewReport(reportPath);

    if (!report && syncMissing) {
      const synced = runSyncReview({ repoRoot, sha });
      if (synced) {
        report = await readReviewReport(reportPath);
      }
    }

    if (!report) {
      blocked.push({
        sha,
        status: "missing",
        findings: 0,
        severity: "none",
        reason: "review-report-missing",
      });
      continue;
    }

    const findings = Array.isArray(report.findings) ? report.findings : [];
    const normalized = findings
      .map((finding) => {
        const severity = ["minor", "major", "blocker"].includes(String(finding?.severity ?? "").toLowerCase())
          ? String(finding.severity).toLowerCase()
          : "minor";
        return {
          ...finding,
          severity,
          dismissed: finding?.dismissed === true,
        };
      })
      .filter((finding) => !finding.dismissed);

    const blocking = normalized.filter((finding) => severityRank(finding.severity) >= thresholdRank);

    details.push({
      sha,
      findings: normalized.length,
      blockingFindings: blocking.length,
    });

    if (threshold !== "none" && blocking.length > 0) {
      const highest = blocking.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0]?.severity ?? "minor";
      blocked.push({
        sha,
        status: "failed",
        findings: blocking.length,
        severity: highest,
        reason: `severity-threshold-${threshold}`,
      });
    }
  }

  return {
    blocked,
    details,
    summary: {
      shas: shas.length,
      blocked: blocked.length,
      actionable: details.reduce((acc, entry) => acc + entry.blockingFindings, 0),
      sync_reruns: syncMissing ? shas.length : 0,
    },
  };
}
