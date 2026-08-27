# Roadmap

Living execution order for Wings of Athena. Update this when a phase ships or a decision locks.

## Shipped (foundation)

- [x] Pure `@wings/math-engine` with deterministic formulas and tests
- [x] `@wings/plan-domain` — fingerprints, section completeness, adoption gates, reforecast lineage
- [x] Web flow: Campaign Setup → Path to Victory → Program & Budget → Adopt Plan
- [x] Shared resource pools, reachability / capacity / cost / allocation gaps
- [x] Fingerprint-bound feasibility acknowledgments
- [x] Scenario lanes (CONSERVATIVE, BASE, EXPANDED) — one plan version per scenario
- [x] Local browser plan storage (pre-database MVP)
- [x] Classification guard (CI + pre-commit hook)
- [x] Netlify deploy contexts, security headers, deploy-context badge
- [x] Field guides and section pipeline explainers
- [x] Program & Budget UI v1 polish (nav completeness, universe anchor, remedy Level 1)
- [x] Roadmap, Blueprint, multi-draft decision memo

## In progress

### Program & Budget UI (v1 polish) — shipped 2026-08-27

Assume **one draft per scenario** ([decision memo](./decisions/MULTI_DRAFT_PER_CAMPAIGN.md)).

- [x] Field-level format and “what happens next” hints
- [x] Section completion visible in workflow nav
- [x] Strategic universe anchor in Program & Budget (sized from Path to Victory)
- [x] Level-1 remedy presentation for COST and REACHABILITY gaps (align with web-ui rules)
- [x] Mobile pass on Program & Budget layout

### Governance

- [ ] GitHub branch protection on `main` (require PR, block direct push)
- [ ] Optional: include `mathEngineVersion` in canonical input fingerprint before persistence
- [ ] Confirm Netlify continuous deployment vs API-only deploy mode ([DEPLOY.md](./DEPLOY.md))

## Next (after Program & Budget v1)

### Product decisions (short)

- [ ] Remedy payload contract for COST and REACHABILITY in UI
- [ ] Confirm adoption blocker UX (all blockers visible — already true in UI)

### Command Center

- [ ] Actual vs plan pacing surfaces
- [ ] Status rings (ON TRACK / WATCH / AT RISK / NO DATA) per web-ui rules
- [ ] Reads adopted plan only — no draft mutation

### Reforecast

- [ ] UI for `createReforecastDraftRecord` from adopted parent
- [ ] Child version lineage visible to manager

## Later

### Persistence and access

- [ ] Server-side plan store (Netlify Database or equivalent)
- [ ] Auth and per-user data; tighten CSP `connect-src`
- [ ] Server enforcement of deploy context for any voter-level data (Blueprint §16)

### Calibration

- [ ] Private `@wings/calibration-profiles` integration by version
- [ ] Never commit empirical values to public repo

## Explicitly not on this roadmap

- Replacing VAN, fundraising CRM, compliance, or volunteer execution systems
- Copying client/casework data into Airtable or this repo
- Multiple competing drafts per scenario in v1
