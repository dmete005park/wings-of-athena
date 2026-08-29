---
name: release-check
description: Runs pre-release verification for Wings of Athena: git diff review, tests, build, browser smoke test, secrets scan, and safety checks with PASS/FAIL report. Use immediately before a release or production deployment.
---

# Release Check

Project-scoped to the Wings of Athena repository. This skill file lives at `.cursor/skills/release-check/SKILL.md` inside the Git repository root only — not in Cursor application directories or user-level configuration. Run all commands from the repository root (`git rev-parse --show-toplevel`).

Use immediately before a Wings of Athena release or production deployment.

Read `AGENTS.md`, `CONTRIBUTING.md`, `docs/DATA_CLASSIFICATION.md`, and `.cursor/rules/data-safety.mdc` first.

Perform:

- git status
- inspect complete diff
- targeted tests
- full test suite
- lint/typecheck if configured
- production build
- browser smoke test
- check for console errors
- check for failed network requests
- check for hardcoded secrets
- check that .env files are not tracked
- check for debugging code
- check for accidental production data changes

Report PASS or FAIL for each check.

Do not deploy, merge, commit, or push unless explicitly instructed.

## Execution order

Run checks in this order. Record actual command output before assigning PASS or FAIL.

### 1. Git status

```bash
git status
```

**PASS** if working tree is intentional (only expected release changes, or clean if verifying a tagged commit).

**FAIL** if untracked files, unexpected modifications, or uncommitted work would be included in the release unknowingly.

### 2. Inspect complete diff

```bash
git diff
git diff --cached
```

If verifying a release candidate against main:

```bash
git diff main...HEAD
git log main..HEAD --oneline
```

**PASS** if every change is expected, scoped to the release, and free of unrelated edits.

**FAIL** if unrelated changes, secrets, debug code, or classified data appear in the diff.

### 3. Targeted tests

Run tests for packages touched by the diff:

```bash
npm run test -w @wings/math-engine
npm run test -w @wings/plan-domain
```

Skip packages with no relevant changes only when the diff is clearly isolated; note what was skipped.

**PASS** if all targeted test runs exit 0.

**FAIL** on any test failure or skipped package that the diff actually touches.

### 4. Full test suite

```bash
npm test
```

Includes `scripts/check-classification.mjs`, math-engine tests, and plan-domain tests.

**PASS** if exit 0.

**FAIL** on any failure.

### 5. Lint / typecheck (if configured)

Check root and workspace `package.json` scripts for `lint`, `typecheck`, or `eslint`.

Current repo: no standalone lint script. Typecheck runs as part of build (`tsc` in each workspace).

If lint exists:

```bash
npm run lint
```

If no lint script but typecheck exists separately:

```bash
npm run typecheck
```

Otherwise run build (step 6) and report:

**PASS (N/A)** — lint not configured; typecheck verified via production build.

**PASS** if lint/typecheck exits 0.

**FAIL** on errors.

### 6. Production build

```bash
npm run build
```

Builds `@wings/math-engine`, `@wings/plan-domain`, and `@wings/web` (includes `tsc`).

**PASS** if exit 0 with no TypeScript or Vite errors.

**FAIL** on any build error.

### 7. Browser smoke test

```bash
npm run dev
```

Use browser MCP against the local dev URL (typically `http://localhost:5173`):

1. `browser_navigate` → app root
2. `browser_lock`
3. Walk primary flow: Campaign Setup → Path to Victory → Program & Budget → Adopt Plan
4. Confirm each screen loads and primary navigation works
5. `browser_snapshot` on key screens
6. `browser_unlock`

**PASS** if all primary screens load and core navigation completes without visible breakage.

**FAIL** if blank screen, crash, broken navigation, or blocking error UI on the happy path.

### 8. Console errors

During the smoke test, use browser CDP:

```javascript
// Runtime.evaluate — collect console messages if not already captured
```

Or reload the page and check for error-level console output while walking the flow.

**PASS** if no unexpected `error` or unhandled rejection messages on the smoke path.

**FAIL** if console errors appear during normal navigation.

### 9. Failed network requests

During the smoke test, enable network monitoring via CDP (`Network.enable`) or inspect failed requests in page load.

**PASS** if no failed requests (4xx/5xx) on the smoke path except expected missing-backend endpoints.

**FAIL** if unexpected failed fetches, CORS errors, or 404s for app assets.

### 10. Hardcoded secrets

Search the diff and codebase for common secret patterns:

```bash
git diff main...HEAD
rg -i "(api[_-]?key|secret|password|token|Bearer |sk_live|sk_test|AIRTABLE|PAT_[a-zA-Z0-9])" --glob "!package-lock.json" .
```

**PASS** if no secrets, tokens, or credentials in tracked files or the release diff.

**FAIL** if any plausible secret is present.

### 11. .env files not tracked

```bash
git ls-files "*.env" ".env" ".env.*"
git check-ignore -v .env .env.local 2>/dev/null || true
```

**PASS** if no `.env` or `.env.*` files are tracked (`.env.example` is allowed).

**FAIL** if any environment file with secrets could be committed.

### 12. Debugging code

Inspect the diff for:

- `console.log`, `console.debug`, `debugger`
- Temporary `TODO`/`FIXME` tied to the release
- Commented-out blocks left from debugging
- `localhost` URLs or test-only bypasses in production paths

```bash
git diff main...HEAD | rg -i "console\.(log|debug|warn)|debugger|127\.0\.0\.1|localhost"
```

**PASS** if no debugging artifacts in the release diff.

**FAIL** if debugging code would ship.

### 13. Accidental production data changes

Check for:

- Real campaign, voter, or client data in fixtures, tests, or committed files
- Changes to `VITE_WINGS_DATA_MODE` or deploy context that would expose classified data in production
- Empirical calibration values committed to the public repo
- `.csv`, `.xlsx`, or voter files added

```bash
npm run check:classification
git diff main...HEAD -- "*.json" "*.ts" "*.tsx" "*.cjs" "*.md"
```

**PASS** if classification guard passes and no classified or production data appears in the diff.

**FAIL** if classification check fails or real campaign data could ship.

## Report template

```markdown
## Release check report

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Git status | PASS / FAIL | |
| 2 | Complete diff review | PASS / FAIL | |
| 3 | Targeted tests | PASS / FAIL | |
| 4 | Full test suite (`npm test`) | PASS / FAIL | |
| 5 | Lint / typecheck | PASS / FAIL / PASS (N/A) | |
| 6 | Production build (`npm run build`) | PASS / FAIL | |
| 7 | Browser smoke test | PASS / FAIL | |
| 8 | Console errors | PASS / FAIL | |
| 9 | Failed network requests | PASS / FAIL | |
| 10 | Hardcoded secrets | PASS / FAIL | |
| 11 | .env not tracked | PASS / FAIL | |
| 12 | Debugging code | PASS / FAIL | |
| 13 | Production data changes | PASS / FAIL | |

### Overall: READY / NOT READY

### Blockers
- [list FAIL items that must be resolved before release]

### Warnings
- [non-blocking concerns]

### Commands run
- [actual commands executed with exit codes]
```

**Overall READY** only if every check is PASS or PASS (N/A). Any FAIL → **NOT READY**.

## After the check

Do not deploy, merge, commit, or push unless explicitly instructed.

If blockers exist, report them and stop. If the user asks to fix issues, use `ship-feature` for code changes.

Netlify production deploy uses `npm run build` with `VITE_WINGS_DEPLOY_CONTEXT=production` per `netlify.toml`. Server-side data enforcement is still required before any classified backend data exists.
