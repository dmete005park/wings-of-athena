# Wings of Athena — Sprint 0 Repository Audit

## Result

A dedicated `wings-of-athena` repository now exists and is the canonical implementation target. Wings should remain isolated from unrelated repositories and technical debt.

## Security rule

Wings must never store API keys, tokens, passwords, or connection secrets in committed source files. Use Netlify environment variables or another approved secrets mechanism.

## Bootstrap decision

Start Wings with a standalone `@wings/math-engine` TypeScript package. The package has no dependency on React, Netlify, a database client, file imports, or external APIs.

## First implementation slice

1. Stable value/evidence types.
2. Metric registry.
3. Assumption registry.
4. Validation helpers.
5. Generic electorate segments.
6. Race-rule and vote-goal math.
7. Strategic-universe construction separate from availability/reachability/capacity.
8. Unique reach + contact depth outreach math.
9. Optional objective modules such as Support IDs.
10. Capacity and pacing.
11. Deterministic manager-facing status.
12. Frozen unit tests.

## Design QA decisions locked before repository bootstrap

- Use generic electorate segments rather than hard-coding 3/3, 2/3, 1/3.
- Keep Strategic Desired Universe separate from availability, reachability, and capacity-supported universe.
- Make Support IDs an optional program objective.
- Use unique reach and contact depth as the primary direct-contact planning concepts.
- Do not sum cross-channel unique reach without deduplication or an explicit overlap method.
- Keep operational performance metrics separate from causal impact estimates.
- Derive ON_TRACK / WATCH / AT_RISK from named deterministic alert severities, never a composite score.
- Return remediation quantities where arithmetic supports them, such as additional shifts required to close a capacity gap.

## Sprint 0 verification

The local bootstrap passes all 14 frozen tests. Repository CI is configured to run the math-engine suite on pull requests and pushes to `main`.
