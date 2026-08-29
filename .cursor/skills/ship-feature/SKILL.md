---
name: ship-feature
description: Ships normal Wings of Athena features with inspection-first changes, regression tests, full verification, and browser checks. Use when implementing or extending product behavior, UI, plan-domain logic, or math-engine features that are not hotfixes or campaign-math-only changes.
---

# Ship Feature

Normal feature development for Wings of Athena. Follow the workflow in order. Do not skip verification steps or claim success without observed output.

## Workflow

1. Read AGENTS.md and relevant project rules.
2. Inspect the existing implementation before modifying code.
3. Identify the smallest coherent change.
4. Preserve existing architecture unless there is a clear reason to change it.
5. Implement the feature.
6. Add or update regression tests.
7. Run targeted tests.
8. Run the complete test suite.
9. Run the production build.
10. Use the browser to verify user-facing behavior when applicable.
11. Inspect git diff for accidental changes, secrets, debugging code, or unrelated edits.
12. Report files changed, tests added, test results, build result, and any remaining limitations.
13. Do not commit or push unless explicitly requested.

## Step 1 — Read first

Read in this order:

1. `AGENTS.md`
2. `README.md` and `CONTRIBUTING.md`
3. Rules under `.cursor/rules/`:
   - Any change: `architecture.mdc`, `git-workflow.mdc`, `testing.mdc`
   - `packages/math-engine/**`: `campaign-math.mdc`
   - Data / Airtable / secrets: `data-safety.mdc`
4. Governing docs in `docs/` when touching adoption gates, capacity, fingerprints, or lifecycle

Before editing, state intended changes and affected files. Wait for confirmation on adoption gates, immutability checks, canonical fingerprints, or the math-engine purity boundary.

## Step 2 — Inspect before changing

Trace the current path end-to-end:

- UI entry points in `apps/web/src/`
- Plan assembly and lifecycle in `packages/plan-domain/src/`
- Calculations in `packages/math-engine/src/`
- Existing tests in `packages/*/tests/` and any related docs

Extend existing modules. Do not duplicate systems. Do not modify `.gitignore`, `package.json`, CI workflows, or `.cursor/rules/` unless that is the task.

## Steps 3–5 — Smallest change, preserve architecture, implement

- One coherent feature per branch
- Match surrounding naming, types, and patterns
- UI: progressive disclosure (answer → cause → audit). Do not expose internal complexity at Level 1
- Math-engine: pure functions only; no I/O, no side effects
- Plan-domain: lifecycle and fingerprints stay in plan-domain, not math-engine
- Never invent empirical campaign values; use invented round numbers in fixtures

If the feature touches campaign math (turnout, win number, propensity, universe, contact rate, persuasion, GOTV), stop and follow the campaign-math change protocol: identify formula, state assumptions, worked example, downstream impact, tests, old-vs-new comparison, explicit product decision.

## Step 6 — Tests

Add or update regression tests for behavior you changed or rely on:

| Area | Location | Runner |
|------|----------|--------|
| Math engine | `packages/math-engine/tests/*.cjs` | `npm run test -w @wings/math-engine` |
| Plan domain | `packages/plan-domain/tests/*.cjs` | `npm run test -w @wings/plan-domain` |

Prefer normal and boundary cases. Snapshot or fixture tests use obviously invented numbers, never plausible real-world campaign data.

## Steps 7–9 — Verify

From repo root:

```bash
# Step 7 — targeted (examples)
npm run test -w @wings/math-engine -- --test-name-pattern="pattern"
npm run test -w @wings/plan-domain -- --test-name-pattern="pattern"

# Step 8 — full suite (includes classification guard)
npm test

# Step 9 — production build
npm run build
```

Report actual command output. Do not claim pass/fail without running the commands.

## Step 10 — Browser verification

When the change is user-facing:

1. Start dev server: `npm run dev`
2. Use browser MCP: navigate → lock → snapshot → interact → screenshot if needed → unlock
3. Confirm the manager-visible outcome matches the feature intent
4. Check mobile-relevant layout when UI layout changed

Skip browser verification only when the change is purely internal (types, pure math with no UI surface, docs-only).

## Step 11 — Diff inspection

```bash
git status
git diff
```

Reject or revert:

- Unrelated edits
- Secrets, credentials, voter data, client identifiers
- Debug logging left in
- Accidental `.csv`/`.xlsx` or build artifacts
- Changes to files outside the stated scope

## Step 12 — Completion report

Use this template:

```markdown
## Ship report

### Files changed
- path/to/file — brief reason

### Tests added/updated
- path/to/test.cjs — what it covers

### Test results
- Targeted: [command] → [pass/fail + summary]
- Full suite: npm test → [pass/fail + summary]

### Build result
- npm run build → [pass/fail + summary]

### Browser verification
- [what was checked, or "N/A — no user-facing change"]

### Limitations / follow-ups
- [anything not done, known gaps, or items needing product decision]
```

## Step 13 — Git

Do not commit or push unless explicitly requested. If the user later asks to commit:

- Stage named paths only (`git add <path>`), never `git add -A` or `git add .`
- Never commit to `main`; work on a branch
- Propose push/merge commands; do not run destructive git operations
