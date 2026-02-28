# AI Review Contract (Codex + Qwen)

This repo uses a lightweight local commit review flow modeled after `maincharacter`.

## Scope

- Maintainers can enforce AI review gate on push.
- Contributors can run the same tooling, but enforcement is optional by default.

## Bootstrap

- Contributor mode (default):
  - `npm install`
  - `npm run setup:githooks`
- Maintainer mode (enforced gate):
  - `npm install`
  - `npm run setup:githooks -- --maintainer`

Maintainer mode sets local git config `mc.aiReviewRequired=true`.

## Hook Behavior

- `pre-commit`: runs `npm run lint`
- `pre-push`: runs `npm run ci:quality` and, in maintainer mode, blocks on unresolved AI findings
- `post-commit`: asynchronously reviews `HEAD`
- `post-push`: asynchronously reviews newly pushed commits

Review artifacts are written to `.codex/reviews/`.

## Engines

- Codex CLI is used when available and authenticated (`codex login status`).
- Qwen local model (via Ollama-compatible endpoint) is optional but enabled by default.

## Key Environment Variables

- `CODEX_REVIEW_ENABLED` (default `1`): master kill switch.
- `CODEX_REVIEW_DIR` (default `.codex/reviews`): artifact location.
- `CODEX_REVIEW_TIMEOUT_SECONDS` (default `600`): Codex review timeout.
- `CODEX_REVIEW_OLLAMA_ENABLED` (default `1`): enable/disable local Qwen run.
- `CODEX_REVIEW_OLLAMA_URL` (default `http://127.0.0.1:11434/v1/chat/completions`)
- `CODEX_REVIEW_OLLAMA_MODEL` (default `qwen3.5:35b-a3b`)
- `CODEX_REVIEW_OLLAMA_NUM_CTX` (default `16384`)
- `CODEX_REVIEW_OLLAMA_TIMEOUT_SECONDS` (default `300`)
- `CODEX_REVIEW_PUSH_GATE_ENABLED` (default `1`)
- `CODEX_REVIEW_PUSH_GATE_MIN_SEVERITY` (default `major`)
- `CODEX_REVIEW_PUSH_GATE_SYNC_MISSING` (default `1`): generate missing review artifacts before evaluating.
- `CODEX_REVIEW_PUSH_GATE_BYPASS` (default `0`): emergency bypass (logged).
- `CODEX_REVIEW_REQUIRED`: override local maintainer flag in CI/dev shells.

## Severity Gate

By default, push is blocked in maintainer mode when unresolved findings include severity `major` or `blocker`.
