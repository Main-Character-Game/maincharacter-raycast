# PAT Scope UX Spec

## Goal
Make Personal Access Token (PAT) permissions explicit today (single scope), while keeping the UI and API forward-compatible for future multi-scope tokens.

## UX Principles
- Show permissions even when only one exists.
- Avoid fake choice: no selector until there are 2+ meaningful scopes.
- Use least-privilege defaults when selectors are introduced.
- Return machine-readable auth errors so clients can explain exactly what to fix.

## Current State (Single Scope)
Current required scope for Raycast Quick Add is `tasks:create`.

### Token Create Form
- Add a read-only `Permissions` field under `Expires in`.
- Render as a locked chip/list item:
  - Label: `Tasks: Create`
  - Helper text: `Required for Raycast Quick Add.`
- Keep this non-interactive until more scopes are available.

### Token List / Token Detail
- Show granted permissions on each token:
  - `Permissions: Tasks: Create`
- Keep existing metadata (`expires`, `last used`) unchanged.

## Future State (Multi Scope)
When 2+ scopes exist, replace read-only permissions with grouped checkboxes.

### Create/Edit Form Behavior
- Section title: `Permissions`
- Default selection:
  - If user starts from integration template `Raycast Quick Add`, preselect minimal required scopes only.
- Use action-oriented labels:
  - `Tasks: Create`
  - `Tasks: Update`
  - `Tasks: Read`
- Show one-line helper text per scope.
- Disable `Create token` until at least one scope is selected.

### Existing Token Scope Changes
- If user removes scopes from existing token, show confirmation:
  - `This may break connected clients using this token.`
- Show “used by” hint if available:
  - `Used by: Raycast (last used 2h ago)`

## Copy (Exact Strings)

### Token Create (Single Scope)
- Field label: `Permissions`
- Field value: `Tasks: Create`
- Helper text: `Required for Raycast Quick Add.`

### Auth Failure (Missing Scope)
- Title: `Authentication Failed`
- Message: `Token missing required permission: Tasks: Create`
- Primary CTA: `Create New Token`
- Secondary CTA: `Open Token Settings`

### Auth Failure (Revoked/Expired)
- Title: `Authentication Failed`
- Message: `Token is revoked or expired. Create a new token and update your client.`

## API Contract

### Token Create Response
Return granted scopes explicitly.

```json
{
  "ok": true,
  "token": {
    "id": "pat_123",
    "prefix": "mc_pat_019ca...",
    "expiresAt": "2027-02-28T00:00:00.000Z",
    "scopes": ["tasks:create"]
  }
}
```

### Token List Response
Include `scopes` on each token.

```json
{
  "ok": true,
  "tokens": [
    {
      "id": "pat_123",
      "name": "Raycast MBP",
      "prefix": "mc_pat_019ca...",
      "expiresAt": "2027-02-28T00:00:00.000Z",
      "lastUsedAt": null,
      "scopes": ["tasks:create"]
    }
  ]
}
```

### API Error Shape for AuthN/AuthZ
All protected endpoints should return machine-readable details.

```json
{
  "ok": false,
  "code": "missing_scope",
  "error": "Token missing required permission",
  "requiredScopes": ["tasks:create"],
  "grantedScopes": [],
  "requestId": "req_abc123"
}
```

Supported `code` values:
- `missing_scope`
- `token_expired`
- `token_revoked`
- `token_invalid`

## Data Model

### Recommended Schema
- `personal_access_tokens`
  - `id`
  - `user_id`
  - `name`
  - `token_hash`
  - `token_prefix`
  - `expires_at`
  - `revoked_at`
  - `last_used_at`
  - `created_at`
- `personal_access_token_scopes`
  - `token_id`
  - `scope` (enum/string, e.g. `tasks:create`)
  - unique(`token_id`, `scope`)

Rationale:
- Join table avoids repaint when scopes expand.
- Keeps queries simple (`exists` checks for required scopes).

## Authorization Check Pattern

Pseudo:
1. Authenticate token.
2. Resolve granted scopes.
3. Compare endpoint-required scopes.
4. On failure return `403 missing_scope` payload with `requiredScopes` + `grantedScopes`.

## Rollout Plan

1. Backend first:
- Persist scopes and return them in token create/list APIs.
- Return structured auth error codes.

2. Web token settings UI:
- Single-scope read-only permissions section now.
- Auto-upgrade to selector when scope catalog > 1.

3. Raycast extension:
- Prefer server `error` text for auth failures.
- If `requiredScopes` appears, render exact missing scope in toast.

## Acceptance Criteria
- Users can see what permissions a token has before copying it.
- 403 failures identify missing scopes explicitly.
- No scope selector shown while only one scope exists.
- Multi-scope expansion requires no breaking API change.
