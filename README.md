# Main Character Raycast

Quickly add tasks to **Main Character** from Raycast.

This extension is a thin client.  
All progress, XP, streaks, and rewards are computed server-side by the Main Character kernel.

---

## Features

- ⚡ Quick Add Task from anywhere
- 📝 Optional notes
- 🚀 Instant capture without opening the browser
- 🔒 Secure API token authentication

---

## Setup

### 1. Generate an API Token

1. Log in to Main Character
2. Go to **Settings → API Tokens**
3. Create a new Personal Access Token
4. Copy the token

### 2. Configure the Extension

In Raycast:

1. Open Extensions → Main Character → Preferences
2. Set:

- **API Base URL**
  - Production: `https://maincharacter.game`
  - Local dev: `http://localhost:3000`
- **Personal Access Token**
  - Paste the token you generated

---

## Security Model

This extension:

- Does not store your password
- Does not compute XP or rewards locally
- Only calls official Main Character API routes
- Never writes directly to the database

All state mutations go through the Main Character command boundary and are policy-checked and auditable.

If you revoke your API token, the extension immediately loses access.

---

## Development

Install dependencies:

```bash
npm install

Run in development mode:

npm run dev

Build for production:

npm run build
```

---

## Architecture

The extension is intentionally minimal:

- UI: Raycast Form
- Network: Single POST request to create a task
- Server: All logic handled by Main Character

No business logic lives in this repository.

---

## License

MIT

