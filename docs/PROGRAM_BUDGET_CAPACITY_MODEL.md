# Program & Budget Capacity Model

V1 defaults to shared campaign resource pools with explicit channel allocations. This prevents the same volunteer/staff pool from being counted independently for doors, phones, or other labor-driven channels.

## Resource pools

A resource pool represents people who can be assigned across one or more channels during a planning period.

Examples:
- volunteer field pool
- paid canvass vendor crew
- phone-bank volunteer pool
- dedicated paid calling team

Each pool carries its available workers and completed shifts per worker. Channels reference a pool and retain their own productivity assumptions such as attempts per completed shift.

If two channels share a pool, Wings must not treat each channel as having access to the full pool. Channel allocation must be explicit before channel-level capacity-supported reach is treated as known.

Dedicated channel teams are represented as separate resource pools rather than as a special calculation mode.

When total channel allocations exceed the available pool, Wings records an `ALLOCATION` constraint. Allocation conflict is distinct from per-channel capacity shortfall because reallocating work between channels may resolve it without adding workers or budget.

## Feasibility diagnosis

Strategic Desired Universe, Reachable Universe, and Capacity-Supported Universe are separate stages.

For an ordered example:
- Strategic Desired: 32,400
- Reachable: 30,100
- Capacity-Supported: 26,800

Wings records two diagnoses:
- Reachability gap: 2,300 voters
- Capacity gap: 3,300 voters

The total operational gap is 5,600, but the component gaps must remain visible because they have different causes and remedies.

## Deterministic remediation

A capacity gap must include the arithmetic needed to close it at current assumptions where inputs are available:
- additional attempts
- additional completed shifts
- additional scheduled shifts when a flake assumption exists
- additional workers at the current completed-shifts-per-worker assumption
- additional completed shifts per remaining active day when the calendar is known
- additional scheduled shifts per remaining active day when a flake assumption is known
- incremental cost when a compatible unit-cost assumption is supplied

Calendar-facing remediation should use scheduled shifts when flake is modeled. Completed-shift pace remains available as underlying arithmetic but must be labeled separately.

Wings computes consequences. It does not choose a tactic for the manager.

## Progressive disclosure

Level 1 should answer the decision question with the smallest useful set of remediation quantities. For a staffing/capacity gap, lead with:
- additional workers required
- incremental cost when available

Level 2 exposes the arithmetic behind those figures, including attempts, completed shifts, scheduled shifts, and daily pace. The full math remains available without crowding the initial decision surface.

## Acknowledgment record

A manager may adopt a lower operational plan, but the acknowledgment must preserve why the constraint was accepted. The immutable plan version keeps:
- constraint type
- strategic metric/value
- operational metric/value
- gap at the time of acknowledgment
- fingerprint of the exact gap snapshot
- manager reason
- actor and timestamp

An acknowledgment is valid only for the gap fingerprint it was created against. If the underlying gap changes because staffing, allocation, reachability, cost, or program-window assumptions change, the acknowledgment becomes stale and must be renewed before adoption.

This allows the future Command Center to explain the original accepted constraint rather than merely stating that a gap exists.

## Section completeness

The canonical Plan Builder may serialize incomplete drafts. It returns per-section status with exact missing keys so Campaign Setup, Path to Victory, and Program & Budget can be developed independently.

Adopt Plan requires every section marked `requiredForAdoption` to be complete, all material calculation snapshots to match the current plan input fingerprint, and all live feasibility gaps to have current acknowledgments where acknowledgment is required.
