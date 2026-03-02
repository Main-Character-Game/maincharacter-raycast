# Main Character Raycast Extension

Quickly add tasks to Main Character from Raycast.

This extension is intentionally a thin client. Task creation, policy checks, idempotency, and all game logic remain server-side in Main Character.

## Features

- Quick Add Task form (`Title`, optional `Notes`)
- Destination `Column` dropdown sourced from Main Character quick-add options
- Selected column is persisted locally until changed
- `Cmd+Enter` submit for fast capture
- Optional `Open task in Main Character after create` toggle (persisted locally, off by default)
- Success toast with `Go to Task` action when auto-open is off
- Uses Personal Access Token (PAT) auth from Raycast secure preferences

## Install (Local Development)

Prerequisites:

- Raycast Desktop with `Advanced -> Enable Developer Mode` turned on
- Node.js + npm installed
- Internet access to install npm dependencies

1. Clone this repo locally.
2. Install dependencies in the repo root:
   - `npm install`
3. In Raycast, run `Import Extension` and select this repo root folder (the folder containing `package.json`).
4. Wait for import/build to finish.
5. Configure extension preferences:
   - `API Base URL`: `https://maincharacter.game` (or local override)
   - `Personal Access Token`: token with `TASK_CREATE` scope
6. Run `Quick Add Task`.

### Troubleshooting Install

- `sh: ray: command not found`:
  - Run `npm install` in the repo root, then retry import.
- Extension command does not appear after import:
  - Confirm you imported the folder that contains `package.json`.
  - Open `Manage Extensions` and verify the extension is enabled.
- Import/build fails:
  - Run `npm run build` in terminal to see the concrete error.

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
- Endpoint: `GET /api/tasks/quick-add/options`
- Auth: `Authorization: Bearer <mc_pat_...>`
- Request:
  - `title` (required)
  - `notes` (optional)
  - `columnId` (optional)
  - `source = "raycast_extension"`
  - `idempotencyKey` (required)
- Success response includes created task identity and canonical task detail URL.

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

## Contributing

Before opening a PR, run:

- `npm run ci:quality`

### CI

GitHub Actions workflow `.github/workflows/ci.yml` runs:

- Triggered on `push` to `main`, `pull_request` to `main`, and manual `workflow_dispatch`
- `quality`: `npm ci`, `npm run ci:quality` (`checks:shared`, `lint`, `test`, `build`)
- `dependency-audit`: `npm ci`, `npm audit --audit-level=high`
- `ci-required`: stable aggregator status check for branch protection

### GitHub Settings

See [`.github/SETTINGS.md`](.github/SETTINGS.md) for recommended repository settings to enable.

## License

MIT
