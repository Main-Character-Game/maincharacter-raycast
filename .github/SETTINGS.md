# Recommended GitHub Settings

## Branch Ruleset (`main`) - Soft Protect

- Disallow force pushes.
- Disallow branch deletion.
- Require linear history.
- Require status checks: `ci-required`.
- Add repository owner(s) as bypass actors while direct pushes to `main` remain in use.

## Security

- Enable Dependabot alerts.
- Enable Dependabot security updates.
- Enable secret scanning.
- Enable push protection for secrets.
- Enable private vulnerability reporting.

## Actions Hardening

- Set default `GITHUB_TOKEN` permissions to read-only at repo level.
- Keep workflow-level permission scopes explicit and minimal.
- Restrict actions policy to GitHub-authored and explicitly allowed actions.

## Future Tightening (when switching to PR-only)

- Require pull request before merge.
- Require approvals.
- Keep `ci-required` as required status check.
- Optionally enable CODEOWNERS enforcement.
