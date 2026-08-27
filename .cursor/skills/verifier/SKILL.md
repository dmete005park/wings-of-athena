---
name: verifier
description: Verifies Wings of Athena work is complete by running targeted tests, full test suite, production build, and diff inspection with PASS/FAIL report. Use before marking a task done or after implementing a feature.
---

# Verifier

Confirm work is actually complete. Report PASS or FAIL for each check. Do not claim success without observed output.

Read `AGENTS.md` and `.cursor/rules/testing.mdc`.

## Checks

1. **Targeted tests** — run tests for packages touched by the change
2. **Full suite** — `npm test` (includes classification guard)
3. **Production build** — `npm run build`
4. **Diff review** — `git diff` for scope, secrets, debug code, unrelated edits

```bash
npm run test -w @wings/math-engine
npm run test -w @wings/plan-domain
npm test
npm run build
git status
git diff
```

For user-facing changes, also confirm browser workflow (see `ui-review` or `ship-feature` step 10).

## Report template

```markdown
## Verification report

| Check | Result | Notes |
|-------|--------|-------|
| Targeted tests | PASS / FAIL | |
| Full suite | PASS / FAIL | |
| Production build | PASS / FAIL | |
| Diff review | PASS / FAIL | |
| Browser (if applicable) | PASS / FAIL / N/A | |

### Overall: COMPLETE / INCOMPLETE
```

Do not commit or push unless explicitly requested.
