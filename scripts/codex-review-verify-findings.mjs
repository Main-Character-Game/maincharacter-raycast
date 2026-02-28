#!/usr/bin/env node

import { readFile } from "node:fs/promises";

function usage() {
  console.log("Usage: node scripts/codex-review-verify-findings.mjs --json <review-json-path>");
}

function severityRank(severity) {
  if (severity === "blocker") return 3;
  if (severity === "major") return 2;
  return 1;
}

function normalizeFinding(input, index) {
  const id = typeof input?.id === "string" && input.id.trim() ? input.id.trim() : `f-${index + 1}`;
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const body = typeof input?.body === "string" ? input.body.trim() : "";
  const severityRaw = typeof input?.severity === "string" ? input.severity.toLowerCase().trim() : "minor";
  const severity = ["minor", "major", "blocker"].includes(severityRaw) ? severityRaw : "minor";
  const confidence = Number.isFinite(input?.confidence) ? Math.max(0, Math.min(1, Number(input.confidence))) : 0.5;
  const file = typeof input?.file === "string" && input.file.trim() ? input.file.trim() : null;
  const line = Number.isInteger(input?.line) && input.line > 0 ? input.line : null;
  const source_model =
    typeof input?.source_model === "string" && input.source_model.trim() ? input.source_model.trim() : null;

  return { id, title, severity, confidence, file, line, body, source_model };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonIndex = args.indexOf("--json");
  if (jsonIndex === -1 || !args[jsonIndex + 1]) {
    usage();
    process.exit(2);
  }

  const jsonPath = args[jsonIndex + 1];
  const raw = await readFile(jsonPath, "utf8");
  const parsed = JSON.parse(raw);
  const findings = Array.isArray(parsed?.findings) ? parsed.findings : [];
  const normalized = findings.map((finding, index) => normalizeFinding(finding, index));

  const seenIds = new Set();
  for (const finding of normalized) {
    if (!finding.title) {
      throw new Error(`finding ${finding.id} is missing title`);
    }
    if (!finding.body) {
      throw new Error(`finding ${finding.id} is missing body`);
    }
    if (seenIds.has(finding.id)) {
      throw new Error(`duplicate finding id ${finding.id}`);
    }
    seenIds.add(finding.id);
  }

  normalized.sort((a, b) => {
    const sevDelta = severityRank(b.severity) - severityRank(a.severity);
    if (sevDelta !== 0) return sevDelta;
    return a.id.localeCompare(b.id);
  });

  const output = {
    schema_version: 2,
    summary: typeof parsed?.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : "Review complete.",
    findings: normalized,
    metadata: {
      ...((parsed?.metadata && typeof parsed.metadata === "object") ? parsed.metadata : {}),
      verified_at: new Date().toISOString()
    }
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  console.error(`[codex-review-verify-findings] ${error.message}`);
  process.exit(1);
});
