# Main Character Raycast Extension

Quickly add tasks to Main Character from Raycast.

This extension is intentionally a thin client. Task creation, policy checks, idempotency, and all game logic remain server-side in Main Character.

## Features

- Quick Add Task form (`Title`, optional `Notes`)
- `Cmd+Enter` submit for fast capture
- Optional `Open task in Main Character after create` toggle (persisted locally, off by default)
- Success toast with `Go to Task` action when auto-open is off
- Uses Personal Access Token (PAT) auth from Raycast secure preferences

## Install (GitHub dogfooding)

1. Clone this repo locally.
2. In Raycast, import/start this extension from your local repo (developer mode).
3. Configure extension preferences:
   - `API Base URL`: `https://maincharacter.game` (or local override)
   - `Personal Access Token`: token with `TASK_CREATE` scope

## Quick Start

1. In Main Character, create a PAT in:
   - `Settings -> Quick Add -> Personal Access Tokens`
2. In Raycast, run `Quick Add Task`.
3. Type title, optional notes, press `Cmd+Enter`.
4. Optional: enable `Open task in Main Character after create` in the form; value is remembered.

## Fast Daily Workflow

- Assign a global hotkey to `Quick Add Task` in Raycast settings.
- Optional deeplink shape:
  - `raycast://extensions/Main-Character-Game/maincharacter-raycast/quick-add-task`
- The command attempts to prefill title from selected text when available.

## API Contract Used

- Endpoint: `POST /api/tasks/quick-add`
- Auth: `Authorization: Bearer <mc_pat_...>`
- Request:
  - `title` (required)
  - `notes` (optional)
  - `source = "raycast_extension"`
  - `idempotencyKey` (required)
- Success response includes created task identity and URL.

## Security Model

- PAT is stored via Raycast secure preference (`password` type).
- No PAT values are logged or shown in error output.
- No local business logic for XP/streak/progression.

## Development

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Quality Gates

This repo includes lightweight CI and local hooks for lint/build checks, plus optional maintainer-enforced Codex/Qwen commit review gating.

- Install hooks (contributor mode, non-blocking AI gate):
  - `npm run setup:githooks`
- Install hooks (maintainer mode, blocking AI gate):
  - `npm run setup:githooks -- --maintainer`

Maintainer mode sets local git config `mc.aiReviewRequired=true`.

### CI

GitHub Actions workflow `.github/workflows/ci.yml` runs:

- `quality`: `npm ci`, `npm run lint`, `npm run build`
- `dependency-audit`: `npm ci`, `npm audit --audit-level=high`
- `ci-required`: stable aggregator status check for branch protection

### AI Review Contract

See [`docs/ai-review-contract.md`](docs/ai-review-contract.md) for:

- Codex/Qwen review behavior
- push gate severity thresholds
- env vars and bypass controls
- review artifact format (`.codex/reviews/`)

### GitHub Settings

See [`.github/SETTINGS.md`](.github/SETTINGS.md) for recommended repository settings to enable.

## License

MIT
