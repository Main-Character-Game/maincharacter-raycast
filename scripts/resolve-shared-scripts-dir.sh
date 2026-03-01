#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
default_shared="$repo_root/../maincharacter/scripts"

if [ -n "${MC_SHARED_SCRIPTS_DIR:-}" ]; then
  candidate="$MC_SHARED_SCRIPTS_DIR"
else
  candidate="$default_shared"
fi

if [ ! -d "$candidate" ]; then
  echo "Shared scripts directory not found: $candidate" >&2
  echo "Set MC_SHARED_SCRIPTS_DIR to your canonical maincharacter/scripts path." >&2
  exit 1
fi

printf '%s\n' "$candidate"
