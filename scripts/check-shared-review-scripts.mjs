#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { constants as FsConstants } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const configured = process.env.MC_SHARED_SCRIPTS_DIR?.trim();
const sharedScriptsDir = configured || path.resolve(repoRoot, "../maincharacter/scripts");

const wrapperFiles = [
  "codex-review-commit",
  "codex-review-post-push",
  "codex-review-push-gate",
  "codex-review-dismiss-finding",
];
const mirroredFiles = ["codex-review-output.schema.json", "codex-review-verify-findings.mjs", "codex-review-push-gate-lib.mjs"];

const expectedWrapper = (name) => `#!/usr/bin/env bash\nset -euo pipefail\n\nrepo_root="$(git rev-parse --show-toplevel)"\nshared_scripts_dir="$($repo_root/scripts/resolve-shared-scripts-dir.sh)"\nexec "$shared_scripts_dir/${name}" "$@"\n`;

async function exists(targetPath) {
  try {
    await access(targetPath, FsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function assertSameFile(localPath, canonicalPath) {
  const [local, canonical] = await Promise.all([readFile(localPath, "utf8"), readFile(canonicalPath, "utf8")]);
  if (local !== canonical) {
    throw new Error(`drift detected: ${localPath} differs from ${canonicalPath}; run npm run checks:shared:sync`);
  }
}

async function main() {
  if (!(await exists(sharedScriptsDir))) {
    console.log(`[shared-review-scripts] skipped: shared dir not found at ${sharedScriptsDir}`);
    process.exit(0);
  }

  for (const name of wrapperFiles) {
    const localPath = path.join(repoRoot, "scripts", name);
    const canonicalPath = path.join(sharedScriptsDir, name);

    if (!(await exists(canonicalPath))) {
      throw new Error(`missing canonical script: ${canonicalPath}`);
    }

    const local = await readFile(localPath, "utf8");
    const expected = expectedWrapper(name);
    if (local !== expected) {
      throw new Error(`wrapper drift detected for scripts/${name}; run npm run checks:shared:sync`);
    }
  }

  for (const name of mirroredFiles) {
    const localPath = path.join(repoRoot, "scripts", name);
    const canonicalPath = path.join(sharedScriptsDir, name);

    if (!(await exists(canonicalPath))) {
      throw new Error(`missing canonical file: ${canonicalPath}`);
    }

    if (!(await exists(localPath))) {
      throw new Error(`missing local mirrored file: ${localPath}; run npm run checks:shared:sync`);
    }

    await assertSameFile(localPath, canonicalPath);
  }

  console.log(`[shared-review-scripts] verified wrappers and mirrored files against ${sharedScriptsDir}`);
}

main().catch((error) => {
  console.error(`[shared-review-scripts] ${error.message}`);
  process.exit(1);
});
