# Contributing

The process is the same whether a person or an agent is writing the code. It exists because this repository is public, the math is load-bearing for real campaigns, and mistakes here are expensive to unwind.

## Never commit to main

Every change goes through a branch and a pull request. No exceptions, including one-line fixes and including changes you have already verified locally.

Branch protection enforces this on GitHub. If you find yourself able to push to `main`, the protection has lapsed and that is itself a bug worth fixing.

Branch names describe the work:

```
feat/program-budget-ui
fix/stale-acknowledgment-routing
chore/ignore-tsbuildinfo
docs/blueprint-sprint-7-update
```

## The loop

```
git checkout main
git pull
git checkout -b <type>/<short-description>
   ... make changes ...
npm test
npm run build
git status
git add <explicit paths>
git commit -m "<type>: <what changed>"
git push -u origin <branch>
   ... open PR, wait for CI, read the diff, merge ...
git checkout main
git pull
git branch -d <branch>
```

Start from an updated `main` every time. Branching from a stale `main` is how you get a merge conflict in code you never touched.

## Stage explicitly

Never use `git add -A` or `git add .`. Name the files:

```
git add scripts/check-classification.mjs package.json
```

Blanket staging is how build artifacts, editor state, and machine-local files reach the repository. `apps/web/tsconfig.tsbuildinfo` got tracked exactly this way.

Run `git status` before every commit and read the list. If something appears that you did not intend to change, stop and find out why.

## Verify before you commit, not after

```
npm test
npm run build
```

`npm test` runs the classification guard first, then math-engine and plan-domain. Both commands must pass locally before you push. CI is a second opinion, not your first check.

If a command in a sequence fails, stop and fix it. Git operations are not a transaction — a failed `git add` followed by a successful `git rm` leaves you halfway through a change with no warning.

## Read the diff

Open the PR's Files Changed tab and read it before merging. This matters more with an agent writing code than it did without one: rules reduce the failure rate but do not eliminate it, and the failures that get through look plausible rather than obviously broken.

Things worth stopping on:

- A file you did not expect to change
- A `.gitignore` or `package.json` change you did not ask for
- Numbers that look empirically realistic (see `docs/DATA_CLASSIFICATION.md`)
- Anything relaxing an adoption gate, an immutability check, or the math-engine purity boundary

## One change per pull request

A PR that fixes a guard and also refactors a screen cannot be reviewed properly and cannot be reverted cleanly. Split it.

## When something lands on main by mistake

Do not force-push and do not rewrite history on `main`. Open a normal PR that corrects it forward. History rewriting on a shared branch breaks every clone, and a small amount of visible mess is cheaper than that.

## Commit messages

```
<type>: <what changed, imperative>
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`.

Describe the change, not the process. "fix: reject reused adopted plan IDs at the store boundary" beats "fix bug."
