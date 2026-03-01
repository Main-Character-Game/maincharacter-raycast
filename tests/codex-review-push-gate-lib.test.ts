import assert from "node:assert/strict";
import test from "node:test";
import {
  ZERO_SHA,
  executePushGate,
} from "../scripts/codex-review-push-gate-lib.mjs";

const SHA = "8a8cbb4c52da1d349acc624af1730f010dc0cb22";
const STDIN_UPDATE = `refs/heads/main ${SHA} refs/heads/main ${ZERO_SHA}\n`;

function createReadState({
  hasReportArtifact,
  missingRequiredReviews,
  localReviewStatus = "pending",
}: {
  hasReportArtifact: boolean;
  missingRequiredReviews: boolean;
  localReviewStatus?: string;
}) {
  return {
    sha: SHA,
    status: hasReportArtifact ? "present" : "missing",
    reason: hasReportArtifact ? "report-present" : "report-missing",
    reviewStatus: "ok",
    failureReason: "",
    findingsCount: 0,
    worstSeverity: "none",
    actionable: false,
    failed: false,
    blocking: false,
    hasCodexReview: true,
    hasLocalReview: localReviewStatus === "ok",
    missingRequiredReviews,
    localReviewStatus,
    hasReportArtifact,
  };
}

test("executePushGate does not rerun sync by default for missing local-model coverage", async () => {
  let syncRuns = 0;

  const result = await executePushGate({
    repoRoot: "/tmp/repo",
    reviewsDir: "/tmp/reviews",
    stdinText: STDIN_UPDATE,
    requireLocalModel: true,
    computeOutgoing: () => [SHA],
    gitExec: () => "main",
    waitForReview: async () => ({ waited: false, timedOut: false }),
    readReviewState: async () =>
      createReadState({
        hasReportArtifact: true,
        missingRequiredReviews: true,
      }),
    ensureCodexReady: () => ({ ok: true, message: "ok" }),
    runSyncReview: () => {
      syncRuns += 1;
      return { ok: true, code: 0 };
    },
  });

  assert.equal(syncRuns, 0);
  assert.equal(result.summary.sync_reruns, 0);
  assert.equal(result.summary.blocked, 1);
  assert.equal(result.blocked[0]?.reason, "local-review-missing");
});

test("executePushGate can rerun sync for missing local-model coverage when explicitly enabled", async () => {
  let syncRuns = 0;
  let readCalls = 0;

  const result = await executePushGate({
    repoRoot: "/tmp/repo",
    reviewsDir: "/tmp/reviews",
    stdinText: STDIN_UPDATE,
    requireLocalModel: true,
    syncCanRepairMissingLocal: true,
    computeOutgoing: () => [SHA],
    gitExec: () => "main",
    waitForReview: async () => ({ waited: false, timedOut: false }),
    readReviewState: async () => {
      readCalls += 1;
      return createReadState({
        hasReportArtifact: true,
        missingRequiredReviews: true,
      });
    },
    ensureCodexReady: () => ({ ok: true, message: "ok" }),
    runSyncReview: () => {
      syncRuns += 1;
      return { ok: true, code: 0 };
    },
  });

  assert.equal(syncRuns, 1);
  assert.equal(readCalls, 2);
  assert.equal(result.summary.sync_reruns, 1);
  assert.equal(result.summary.blocked, 1);
  assert.equal(result.blocked[0]?.reason, "local-review-missing");
});
