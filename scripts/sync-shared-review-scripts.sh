#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
shared_scripts_dir="$($repo_root/scripts/resolve-shared-scripts-dir.sh)"

wrapper_files=(
  "codex-review-commit"
  "codex-review-post-push"
  "codex-review-push-gate"
  "codex-review-dismiss-finding"
  "codex-review-local-enqueue"
  "codex-review-local-worker"
)

mirrored_files=(
  "codex-review-output.schema.json"
  "codex-review-verify-findings.mjs"
  "codex-review-push-gate-lib.mjs"
)

for name in "${wrapper_files[@]}"; do
  cat > "$repo_root/scripts/$name" <<WRAPPER
#!/usr/bin/env bash
set -euo pipefail

repo_root="\$(git rev-parse --show-toplevel)"
shared_scripts_dir="\$(\$repo_root/scripts/resolve-shared-scripts-dir.sh)"
exec "\$shared_scripts_dir/$name" "\$@"
WRAPPER
  chmod +x "$repo_root/scripts/$name"
done

for name in "${mirrored_files[@]}"; do
  cp "$shared_scripts_dir/$name" "$repo_root/scripts/$name"
  if [ "$name" = "codex-review-verify-findings.mjs" ] || [ "$name" = "codex-review-push-gate-lib.mjs" ]; then
    chmod +x "$repo_root/scripts/$name" || true
  fi
done

echo "Synced shared review scripts from: $shared_scripts_dir"
