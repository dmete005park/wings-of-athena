# Adopt Plan Gates

This note records the two additional pre-Adopt Plan invariants identified after Sprint 3.

## 1. Calculation snapshot freshness at adoption

`adoptPlanRecord()` currently recomputes the plan's top-level input hash. That prevents a stale hash from being carried forward, but it is not sufficient: a stale calculation snapshot could still be adopted under a newly computed input hash.

Before adoption, Wings must prove that the calculation snapshot was produced from the same canonical inputs being adopted.

Required behavior:
- store the canonical input fingerprint used to produce the calculation snapshot;
- recompute the canonical fingerprint from the current plan inputs at adoption;
- refuse adoption when the current input fingerprint, stored plan input fingerprint, or calculation-snapshot input fingerprint do not match;
- return a deterministic `PLAN_RECALC_REQUIRED`-style error rather than silently recomputing during adoption;
- require the manager to review the recalculated plan before adoption.

## 2. Explicit feasibility-gap acknowledgment

Strategic desired universe must remain distinct from operationally supported universe.

When an adopted operational universe is below strategic desired universe because of capacity, cost, reachability, or another explicit constraint, the adopted plan must preserve an acknowledgment record rather than redefining strategic need.

The record should include:
- stable decision/acknowledgment ID;
- constraint type;
- strategic metric key and value;
- operational metric key and adopted value;
- numeric gap;
- manager reason/note;
- actor ID;
- timestamp.

Adoption must fail when a material feasibility gap requiring acknowledgment exists and no matching acknowledgment is stored.

These gates must be covered by tests before the first Adopt Plan UI is merged.
