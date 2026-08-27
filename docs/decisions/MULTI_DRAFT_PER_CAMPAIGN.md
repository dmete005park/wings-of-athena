# Decision: Multiple drafts per campaign

**Status:** ADOPTED (v1)  
**Date:** 2026-08-27  
**Owner:** David Metellus

## Question

Can a manager keep several editable plan drafts under one campaign (e.g. “March reforecast”, “post-poll update”, “vendor swap scenario”), or is there exactly one active draft per scenario lane?

## Decision (v1)

**One active draft per scenario per campaign.** Scenarios (CONSERVATIVE, BASE, EXPANDED) are parallel plan versions under the same `campaignId`, each with its own `planVersionId`. There is no second editable draft for the same scenario without forking.

**Fork path:** Reforecast creates a new child `planVersionId` from an adopted parent. Adopted versions are immutable.

## Why this option for v1

| Factor | One draft / scenario | Multiple named drafts / scenario |
|--------|----------------------|----------------------------------|
| Storage | One record per scenario in local MVP | List UI, naming, dedupe, stale draft cleanup |
| Fingerprints | Single hash line per scenario | Manager must know which draft they reviewed |
| Adoption | Save → adopt on one version | “Which draft am I adopting?” |
| Scenarios gate | Scenarios compare lanes (C/B/E) | Scenarios compare arbitrary saved alternatives |
| Implementation | Matches current `App.tsx` + `LocalPlanStore` | New plan picker, version lineage UI |

Scenarios are a **release gate**: they answer “how does the plan change under conservative vs expanded assumptions?” That requires stable scenario lanes, not a folder of unnamed drafts.

Multiple drafts per scenario is valuable later for “save alternative without adopting” (vendor A vs vendor B staffing). It is not required to ship the first end-to-end adopt workflow.

## What the codebase does today

- `campaignId` — one browser-local campaign identity.
- `planVersionId` — one per scenario (`ensureIdentity(scenario)`).
- Switching scenario loads a different draft and plan version; no multi-draft picker within a scenario.
- README: “multiple scenario plan versions per campaign.”

## Explicit non-goals (v1)

- Named draft folders (“Draft 2”, “Reforecast attempt”) within BASE.
- Branching drafts without adopting the parent first (except `REFORECAST_DRAFT` after adoption).
- Cross-scenario merge or copy.

## Revisit triggers

Reopen this decision when:

1. Managers need to compare two staffing models **without** adopting either.
2. Persistence moves off `localStorage` and needs a clear `plan_versions` table shape.
3. Command Center or Reforecast requires historical draft comparison beyond parent/child lineage.

## If we expand later

Preferred model: **adopted plan stays immutable**; new editable drafts are always new `planVersionId` rows with `parentPlanVersionId` and a manager-visible label. Never mutate adopted rows. Never silently overwrite an in-progress draft on save without confirmation.

## Related decisions (still open)

- **All blockers at once vs first:** UI lists all blockers; `assertPlanReadyForAdoption` throws first. Policy unchanged.
- **Remedy payloads for COST / REACHABILITY:** Level 1 in Program & Budget UI — budget gap dollars; reachability shortfall count plus explicit “no deterministic remedy” copy. Level 2 contract still open on roadmap.
