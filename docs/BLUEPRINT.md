# Blueprint (engineering mirror)

This document mirrors the product blueprint contracts enforced in code and docs. When the authoritative blueprint changes, update this file in the same PR.

## Product spine

**Flow:** Campaign Setup → Path to Victory → Program & Budget → Adopt Plan → Command Center → Reforecast

**Current web reach:** Through Adopt Plan (local storage). Command Center and Reforecast are not implemented.

**Planning unit:** One campaign, multiple **scenario** plan versions (CONSERVATIVE, BASE, EXPANDED). One active **draft** per scenario; adoption locks that version. See [MULTI_DRAFT_PER_CAMPAIGN.md](./decisions/MULTI_DRAFT_PER_CAMPAIGN.md).

## Architecture boundaries

| Layer | Package / path | May import | Must not import |
|-------|----------------|------------|-----------------|
| Math | `packages/math-engine` | Pure TS, types | React, Netlify, DB, network, `apps/web` |
| Plan lifecycle | `packages/plan-domain` | math-engine types only | React, Netlify, concrete DB |
| UI | `apps/web` | math-engine, plan-domain | Must not build `PlanVersionRecord` without plan-domain builder |
| Server | `netlify/functions` | packages (future) | Must not bypass deploy-context rules for classified data |

UI and Functions call the engine. The engine never calls outward.

## §7.2 — Calibration and restricted research

- Empirical calibration values live in private `@wings/calibration-profiles`, referenced by version on the plan record.
- Restricted or proprietary research must not become public defaults or committed fixtures.
- Public repo: formulas, types, synthetic round-number fixtures only.
- Enforcement: `docs/DATA_CLASSIFICATION.md`, `scripts/check-classification.mjs`, CI.

## §16 — Deploy context and data mode

Privacy and aggregation rules key on **deploy context**, not on feature flags alone.

| Context | `VITE_WINGS_DEPLOY_CONTEXT` | `VITE_WINGS_DATA_MODE` | Purpose |
|---------|----------------------------|------------------------|---------|
| Production | `production` | `production` | Live manager workflow (future: auth + server store) |
| Deploy preview | `deploy-preview` | `aggregate-only` | PR previews — no voter-level backend |
| Branch deploy | `branch-deploy` | `aggregate-only` | Branch URLs |
| Staging | `staging` | `aggregate-only` | Reserved for `staging` branch workflow |
| Local dev | `dev` / unset | `synthetic-only` | `npm run dev`; badge shows when not production |

Client-visible env vars are **not** a security boundary. Server Functions must enforce context when classified data exists.

Configured in `netlify.toml`. Read in app via `apps/web/src/deployContext.ts`.

## Plan record and fingerprints

- Canonical inputs are hashed with sorted-key JSON + FNV1a32 (`packages/plan-domain/src/hash.ts`).
- `enabledObjectiveIds` are part of canonical inputs (sorted, deduped).
- Calculation snapshots carry the input hash produced at build time.
- Adoption refuses stale snapshots, hash mismatch, incomplete sections, and stale gap acknowledgments (`docs/ADOPT_PLAN_GATES.md`).

**Gap:** `mathEngineVersion` is on the plan record but not yet in the canonical input hash. Track on roadmap before persistence.

## Program & Budget model

- Shared resource pools with explicit per-channel shift allocation.
- Strategic desired universe ≠ reachable ≠ capacity-supported.
- Constraint types: REACHABILITY, CAPACITY, COST, ALLOCATION — different remedies.
- Cross-channel unique reach is not summed without a dedupe method.

See `docs/PROGRAM_BUDGET_CAPACITY_MODEL.md`.

## Adoption gates (summary)

1. Required sections complete for enabled objectives.
2. Top-level `inputHash` matches recomputed canonical inputs.
3. Manager `expectedInputHash` matches saved plan at adopt time.
4. Every calculation snapshot `inputHash` matches current canonical hash.
5. Material feasibility gaps have current acknowledgments bound to gap fingerprint.

## Immutability

- `ADOPTED` and `ADOPTED_REFORECAST` plans cannot be mutated or overwritten in the store.
- Reforecast creates a new `planVersionId` with `parentPlanVersionId` and `REFORECAST_DRAFT` status.

## UI disclosure levels (manager-facing)

1. **Answer** — status, goal, gap, next action.
2. **Cause** — plain-language diagnosis and Level-1 remedies (workers, cost).
3. **Audit** — metric keys, formula IDs, hashes (Adopt Plan section today).

Field guides are Level-2 hints at inputs (`apps/web/src/fieldGuides.ts`).

## Repository hygiene

- No direct commits to `main` (branch protection — pending GitHub ruleset).
- Stage named paths only (`CONTRIBUTING.md`).
- `npm test` + `npm run build` before merge.
