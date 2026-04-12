# Pitch Tracker — Claude Instructions

## Git Workflow

After pushing code changes to the feature branch, automatically complete the full PR flow without asking for confirmation:

1. Create a PR with `gh pr create`
2. Immediately merge it with `gh pr merge --merge`

Use a clear, descriptive PR title and a brief summary of what changed and why.

## Version Bumping

Every PR must increment the minor version (e.g. v1.1 → v1.2). Update **both** of these together:
1. `APP_VERSION` constant in the Babel script block (near line 127)
2. `<meta name="app-version" content="..."/>` in the `<head>` (line 12)

These two must always match. The meta tag is what triggers the automatic cache-bust on the client.
