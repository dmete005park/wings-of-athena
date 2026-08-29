# Wings of Athena

Wings of Athena is a campaign-manager decision layer built around deterministic planning math, explicit assumptions, feasibility constraints, actual-vs-plan measurement, and reforecasting.

It is not intended to replace voter contact, fundraising CRM, compliance, communications, event registration, or volunteer-management systems. Those systems execute work. Wings owns the campaign plan, the math behind it, the constraints on it, and the record of what the manager adopted.

## Current implementation

The repository currently includes:

- `@wings/math-engine`, a pure TypeScript deterministic math package
- `@wings/plan-domain`, which owns plan versions, fingerprints, section completeness, feasibility acknowledgments, adoption, and reforecast lineage
- a React/Vite web app with Campaign Setup, Path to Victory, Program & Budget, and Adopt Plan
- shared campaign resource pools with explicit channel allocations
- separate reachability, capacity, cost, and allocation constraints
- fingerprint-bound feasibility acknowledgments with stale-acknowledgment detection
- objective-aware section completeness, including optional Support IDs
- multiple scenario plan versions per campaign
- local-browser plan storage for the current pre-database MVP
- a public/private calibration boundary with no empirical calibration values committed to this repository
- field guides and section pipeline explainers for manager inputs
- Netlify deploy with context-specific data modes and security headers

Command Center and Reforecast UI are not implemented yet.

## Product flow

`Campaign Setup → Path to Victory → Program & Budget → Adopt Plan → Command Center → Reforecast`

The current executable web flow reaches Adopt Plan. Adoption requires all required sections to be complete, calculation snapshots to match the current canonical input fingerprint, the manager-reviewed fingerprint to match the saved plan, and every material feasibility gap to have a current acknowledgment when acknowledgment is required.

## Planning principles

- Formulas are deterministic and auditable.
- Strategic Desired Universe is preserved separately from reachable and capacity-supported universes.
- Unique reach and contact depth are distinct.
- Shared workers cannot be independently counted by multiple channels.
- Missing required data is surfaced as missing; Wings does not silently invent a healthy default.
- Reachability, capacity, cost, and allocation are different constraint types because their remedies differ.
- Manager acknowledgments are bound to the exact gap snapshot accepted at the time.
- Adopted plan versions are immutable. Reforecasting creates a new child version.

## Documentation

- [Roadmap](./docs/ROADMAP.md) — what ships next
- [Deployment](./docs/DEPLOY.md) — Netlify modes, redeploy, access decisions
- [Blueprint (engineering mirror)](./docs/BLUEPRINT.md) — contracts enforced in code
- [Multi-draft decision](./docs/decisions/MULTI_DRAFT_PER_CAMPAIGN.md) — one draft per scenario (v1)
- [Data classification](./docs/DATA_CLASSIFICATION.md)
- [Adopt Plan gates](./docs/ADOPT_PLAN_GATES.md)
- [Program & Budget capacity model](./docs/PROGRAM_BUDGET_CAPACITY_MODEL.md)

This repository is public. Formula implementations, types, validation rules, lifecycle contracts, and synthetic fixtures may be committed here.

Empirical calibration values, voter/client data, real-campaign fixtures, restricted research, credentials, and identifying client material must not be committed. See `docs/DATA_CLASSIFICATION.md`.

Run the classification guard with:

```bash
npm run check:classification
```

## Run locally

```bash
npm install
npm test
npm run build
npm run dev
```

## Repository architecture

```text
apps/web                  React + Vite manager UI
packages/math-engine      Pure deterministic formulas
packages/plan-domain      Plan lifecycle and adoption contracts
docs                      Engineering and data-boundary documentation
scripts                    Repository safety checks
netlify/functions         Future server-side integration boundary
```

UI, Netlify Functions, database code, imports, and connectors may call the math engine. The math engine must never call UI, network, database, or import code.

## Deploy contexts

`netlify.toml` defines separate production, deploy-preview, branch-deploy, and local-development context labels. Preview and branch contexts are marked aggregate-only; local development is synthetic-only. These client-visible labels are not a security boundary. When voter-level backend data is introduced, server-side Functions must enforce access from the actual Netlify deploy context.

Security headers are configured globally for Netlify-served static content.

Deploy via Netlify (see `netlify.toml`). Production and preview contexts set different `VITE_WINGS_*` labels at build time; server-side enforcement is required before any classified backend data exists.
