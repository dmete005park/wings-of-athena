---
name: campaign-calculation-change
description: Changes Wings of Athena campaign math with formula documentation, assumption tracing, regression tests, and old-vs-new output comparison. Use when changing turnout assumptions, win numbers, voter universes, support projections, contact targets, persuasion targets, GOTV calculations, Election Day projections, or other campaign math.
---

# Campaign Calculation Change

Campaign calculations are business-critical. Use this skill whenever changing turnout assumptions, win numbers, voter universes, support projections, contact targets, persuasion targets, GOTV calculations, Election Day projections, or other campaign math.

Read first: `AGENTS.md`, `.cursor/rules/campaign-math.mdc`, `docs/BLUEPRINT.md`, and any area doc (e.g. `docs/PROGRAM_BUDGET_CAPACITY_MODEL.md` for capacity/allocation).

All formulas live in `packages/math-engine/src/`. The UI and plan-domain call the engine; they must not reimplement math.

## Before changing code

- locate the existing calculation
- state the current formula
- identify assumptions
- identify downstream dependencies
- provide a worked numerical example

Present this analysis and wait for explicit product approval before editing behavior. These require explicit product decisions — never silently change:

- turnout assumptions
- win-number formulas
- voter propensity definitions
- universe definitions
- contact-rate assumptions
- persuasion assumptions
- GOTV targets

### Where to look

| Topic | Module | Registry keys |
|-------|--------|---------------|
| Turnout / electorate | `electorate.ts` | `turnout.segment.*` |
| Win threshold / vote goal | `victory.ts`, `raceRules.ts` | `victory.target_share` |
| Universe stages | `universe.ts` | `universe.method_and_parameters` |
| Outreach / contact | `outreach.ts` | `outreach.contact_depth_target`, `outreach.per_attempt_contact_rate` |
| Support IDs / GOTV | `objectives.ts` | `support_ids.coverage_target`, `support_ids.turnout_rate` |
| Capacity / field activity | `capacity.ts`, `programBudget.ts` | `capacity.attempts_per_shift`, `volunteer.flake_rate` |
| Pacing / Election Day projection | `pacing.ts` | `pace.recent_window_active_days` |
| Alerts driven by math | `alerts.ts` | — |

Formula IDs and metric keys: `metricRegistry.ts`, `assumptionRegistry.ts`. Never introduce bare string keys at call sites.

### Pre-change analysis template

```markdown
## Calculation change proposal

### Location
- File/function: packages/math-engine/src/...
- Formula ID: e.g. victory.vote_goal.v0.2
- Metric key(s): e.g. victory.vote_goal

### Current formula
[Plain-language and symbolic description of existing behavior]

### Assumptions
- assumption key — source (EvidenceClass) — current value or input

### Downstream dependencies
- [metrics, alerts, UI sections, adoption gates affected]

### Worked example (invented round numbers)
Inputs: ...
Step-by-step: ...
Current output: ...

### Proposed change
[What changes and why — product decision required]
```

Use obviously invented round numbers (e.g. 100, 200, 0.5). Never use plausible real-world campaign data in examples or fixtures.

## When implementing

- do not silently change assumptions
- keep formulas centralized
- avoid duplicating calculation logic
- add regression tests
- include normal, boundary, and zero-value cases
- compare old and new outputs when modifying an existing formula

### Implementation rules

1. **Centralize** — edit the existing function in `packages/math-engine/src/`. Do not copy math into `apps/web/` or `packages/plan-domain/`.
2. **Purity** — no I/O, no `Date.now()`, no randomness, no imports from UI/storage/network.
3. **Version formula changes** — when behavior changes, bump the formula ID suffix in `metricRegistry.ts` (e.g. `v0.2` → `v0.3`) and bump `MATH_ENGINE_VERSION` in `index.ts`. Calibration default changes belong in the private calibration package, not the engine.
4. **Assumptions** — register new keys in `assumptionRegistry.ts`. Do not change default assumption values without explicit approval.
5. **Universe stages** — Strategic Desired, Reachable, and Capacity-Supported universes stay distinct. Reachability gap and capacity gap are reported separately.
6. **Old vs new** — before replacing behavior, capture outputs for the same fixture inputs. Document both in the completion report.

### Test requirements

Add or update tests in `packages/math-engine/tests/*.cjs`:

- **Normal** — typical invented inputs with expected outputs
- **Boundary** — min/max valid values, rounding edges (ceil/floor per metric rounding policy)
- **Zero-value** — zero electorate, zero contact rate, zero universe, empty segments (expect errors or null per existing patterns)

Follow existing test style in `core.test.cjs`, `allocation.test.cjs`, `programBudget.test.cjs`.

## After implementation

- run calculation tests
- run the full test suite
- run the production build
- report exactly which formulas changed
- do not commit or push unless explicitly requested

```bash
# Calculation tests
npm run test -w @wings/math-engine

# Full suite (classification guard + plan-domain)
npm test

# Production build
npm run build
```

Report actual command output. Do not claim pass/fail without running the commands.

Inspect `git diff` for accidental changes, secrets, debug code, or duplicated logic outside math-engine.

### Completion report template

```markdown
## Campaign calculation change report

### Formulas changed
- formulaId (old → new): brief description of behavior change
- MATH_ENGINE_VERSION: old → new

### Assumptions changed
- [key — what changed, or "none"]

### Files changed
- path — reason

### Tests added/updated
- packages/math-engine/tests/... — cases covered (normal / boundary / zero)

### Old vs new outputs
| Fixture inputs | Old output | New output |
|----------------|------------|------------|
| ... | ... | ... |

### Test results
- npm run test -w @wings/math-engine → [pass/fail]
- npm test → [pass/fail]

### Build result
- npm run build → [pass/fail]

### Downstream impact verified
- [alerts, pacing, capacity, UI metrics affected]

### Limitations / follow-ups
- [anything needing product decision or deferred work]
```

## Git

Do not commit or push unless explicitly requested. If asked to commit later:

- Stage named paths only; never `git add -A` or `git add .`
- Never commit to `main`
- Never commit empirical calibration values, voter data, or client identifiers
