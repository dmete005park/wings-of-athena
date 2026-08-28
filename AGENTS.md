# Wings of Athena

Wings of Athena is a campaign management application used from campaign setup through Election Day.

## Product goals

The application should help a campaign manager quickly understand:

- total registered voters
- expected turnout
- win number
- voter universe
- support targets
- persuasion targets
- turnout targets
- field goals
- budget requirements
- progress against plan
- Election Day status

The front end should stay simple even when the calculations and data model are complex.

Users should not need campaign-data expertise to understand what they should do next.

## Product behavior

Prefer decision-useful information over raw data.

Use plain campaign language.

Avoid exposing internal technical concepts unless required.

Show assumptions when they affect a decision.

Calculations should be traceable. A manager should be able to understand how an important number was produced.

## Campaign math

Treat campaign calculations as business-critical logic.

Never silently change:

- turnout assumptions
- win-number formulas
- voter propensity definitions
- voter universe definitions
- support assumptions
- persuasion assumptions
- contact-rate assumptions
- GOTV assumptions

Before changing campaign math:

1. identify the existing formula
2. identify the assumptions
3. identify downstream calculations
4. provide a worked numerical example
5. add regression tests

Keep shared calculations centralized. Do not duplicate campaign math across components.

## Architecture

Inspect the existing implementation before introducing new architecture.

Prefer extending existing modules over creating parallel systems.

Prefer small, traceable changes over broad rewrites.

Do not refactor unrelated code while implementing a feature unless explicitly requested.

Keep business logic separate from presentation logic where practical.

## Data

Airtable may serve as a future operational data source. It is not integrated in this repository yet.

Before changing Airtable-dependent code:

- inspect the actual schema
- never guess table names
- never guess field names
- identify dependent code
- handle missing and null values

Do not delete, rename, or change field types without explicit approval.

## Environment safety

Development and preview environments must be safe by default.

Do not perform unintended production writes during development or testing.

Do not expose secrets in code, logs, screenshots, commits, or documentation.

Never commit `.env` files containing secrets.

## Testing

Every important business rule should have regression coverage.

For calculation changes, test:

- normal values
- zero values
- boundary values
- missing values where applicable

Before declaring work complete:

- run targeted tests
- run the full test suite
- run the production build
- inspect the complete diff

For user-facing changes, verify the workflow in the browser.

Do not weaken tests merely to make them pass.

## UI

Design for campaign managers rather than developers.

Each major screen should make clear:

- what the user is looking at
- what the numbers mean
- what needs attention
- what action comes next

Avoid unnecessary technical language.

Desktop and mobile behavior should both be checked for major workflows.

## Git

Do not commit, push, merge, deploy, or modify production unless explicitly instructed.

Before committing:

- inspect git status
- inspect the complete diff
- confirm tests pass
- confirm the production build succeeds
- check for secrets
- check for debugging code
- check for unrelated changes

## Documentation

Important product or architecture decisions should be documented under `docs/`.

Use decision records when a choice would otherwise be difficult to understand from the code alone.

## Agent skills

Project skills live in `.cursor/skills/`:

| Skill | Use when |
|-------|----------|
| `ship-feature` | Normal feature development |
| `campaign-calculation-change` | Changing campaign math |
| `airtable-schema-change` | Airtable tables, fields, or sync logic |
| `ui-review` | Manager-perspective UX review |
| `release-check` | Pre-release or production deployment |
| `architecture-reviewer` | Reviewing module boundaries and architecture |
| `verifier` | Confirming tests, build, and diff before completion |
| `security-reviewer` | Secrets, data classification, environment safety |

Project rules live in `.cursor/rules/`.
