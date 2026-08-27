# Wings of Athena

Wings of Athena is a campaign manager decision layer built around deterministic planning math, explainable assumptions, actual-vs-plan measurement, and reforecasting.

The MVP is intentionally not a replacement for voter contact, fundraising CRM, compliance, communications, or volunteer-management systems. Those systems supply execution data. Wings owns the campaign plan, feasibility math, pacing, variance, and the living path to victory.

## Sprint 0

The first implementation is the standalone `@wings/math-engine` TypeScript package. It has no dependency on React, Netlify, a database, file imports, or external APIs.

Implemented so far:

- generic electorate-segment turnout math
- majority, plurality, and runoff race rules
- campaign vote-goal math without a hard-coded strategic cushion
- strategic universe construction separated from availability, reachability, and capacity
- unique reach + contact depth outreach math
- optional Support-ID objective math
- capacity, staffing, pacing, and remediation math
- deterministic `ON_TRACK` / `WATCH` / `AT_RISK` status from named rules
- stable metric and assumption registries
- evidence classes and validation helpers
- frozen engine tests

## Run locally

```bash
npm install
npm test
```

## Architecture rule

UI, Netlify Functions, database code, imports, and connectors may call the math engine. The math engine must never call them.

## Product flow

`Campaign Setup → Path to Victory → Program & Budget → Adopt Plan → Command Center → Reforecast`
