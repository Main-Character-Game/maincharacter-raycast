#!/bin/sh

resolve_codex_reviews_dir() {
  repo_root="$1"
  preferred_dir="$2"

  if [ -z "$preferred_dir" ]; then
    preferred_dir="$repo_root/.codex/reviews"
  fi

  if (umask 077 && mkdir -p "$preferred_dir/logs") 2>/dev/null; then
    chmod 700 "$preferred_dir" "$preferred_dir/logs" 2>/dev/null || true
    printf '%s\n' "$preferred_dir"
    return 0
  fi

  uid_value="unknown"
  if command -v id >/dev/null 2>&1; then
    uid_value="$(id -u 2>/dev/null || printf 'unknown')"
  fi

  if command -v shasum >/dev/null 2>&1; then
    repo_hash="$(printf '%s' "$repo_root" | shasum -a 256 | awk '{print $1}')"
  elif command -v sha256sum >/dev/null 2>&1; then
    repo_hash="$(printf '%s' "$repo_root" | sha256sum | awk '{print $1}')"
  else
    repo_hash="$(printf '%s' "$repo_root" | cksum | awk '{print $1}')"
  fi

  fallback_dir="/tmp/maincharacter-codex-reviews-${uid_value}-${repo_hash}"
  if ! (umask 077 && mkdir -p "$fallback_dir/logs") 2>/dev/null; then
    return 1
  fi

  chmod 700 "$fallback_dir" "$fallback_dir/logs" 2>/dev/null || true
  printf '%s\n' "$fallback_dir"
}
