# Data Classification

This repository is public. Git history is permanent. Making the repository
private later does not retract anything that was published, because clones,
forks, and caches persist.

Read this before committing.

## The rule in one line

Formulas are public. Numbers derived from real campaigns are not.

The arithmetic in this repository is commodity. Majority is half plus one.
Attempts are universe times contact depth. Shifts are attempts over attempts
per shift. Publishing that costs nothing and proves the central product claim:
that Wings is deterministic and auditable rather than an opaque model.

What took years to acquire is the empirical layer — what turnout actually runs
at by history group, what contact rates actually hold by channel and
geography, what volunteers actually flake at, what field work actually costs.
That is the product. It does not belong here.

## Never commit

**Calibration values.** Any empirical estimate derived from real campaign
results: turnout probabilities, contact rates, flake rates, attempts per
shift, unit costs, alert thresholds. These live in the private
`@wings/calibration-profiles` package and are referenced by version.

**Restricted or proprietary research.** Any value, table, or finding from a
source carrying a reuse restriction. Blueprint 7.2 already forbids these from
becoming customer-facing defaults; a public repository is more exposed than a
customer-facing default. Committing one is a third-party licensing breach, not
merely a competitive loss.

**Client or campaign data.** Precinct files, turnout history, voter records,
universe files, budgets, vendor contracts, production actuals. This includes
aggregated and anonymized forms, and includes test fixtures. Real campaign
turnout geography and client-derived fixtures stay in the private fixture
package.

**Anything identifying a client.** Campaign names, candidate names, district
identifiers, staff names, vendor names.

**Credentials.** API keys, tokens, connection strings, `.env` files, private
keys, service account JSON. Use environment variables and secret-management
controls in the deployment platform.

## Safe to commit

- Formula implementations and their tests
- Type definitions, metric and assumption registries
- Validation rules and error codes
- Plan lifecycle, fingerprinting, and adoption logic
- Architecture decisions and interface contracts
- Synthetic fixtures with invented numbers

## Fixtures

Seed fixtures in this repository must be invented. A fixture that happens to
reproduce a real campaign's turnout pattern is client data wearing a costume.

Invent round numbers that make the arithmetic easy to check by hand. A fixture
exists to prove a formula is correct, not to demonstrate that a value is
realistic. Realism is calibration's job and calibration is private.

## Placeholder discipline

Because the public build ships `NULL_CALIBRATION_PROFILE`, empirical
assumptions in a standalone build remain manager-supplied or
`PRODUCT_PLACEHOLDER`. Math Engine Rule 3 requires provisional defaults to be
visibly labeled. The UI must not present a placeholder as though it were a
benchmark.

## Before you commit

```bash
npm run check:classification
```

The check is a coarse net, not a substitute for judgment. It cannot tell a
plausible invented turnout rate from a real one. You can.

## If something lands here by mistake

Do not quietly delete it. Deleting a file does not remove it from history.

1. Tell whoever owns the data or the third-party agreement first.
2. Rotate any exposed credential immediately. Assume it is compromised.
3. Decide whether history rewriting is worth it. For a credential, rotation is
   mandatory regardless. For restricted third-party research or client data,
   history rewriting may also be appropriate and should be handled deliberately.
