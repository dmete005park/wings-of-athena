# Deployment

How Wings of Athena ships on Netlify, and what must be decided before the URL carries real campaign work.

## Site and source

- **Production URL:** `https://wings-of-athena.netlify.app` (Athena Code team site)
- **Build:** `npm run build` → `apps/web/dist` (`netlify.toml`)
- **Functions:** `netlify/functions` (health check today; future server boundary)

Repo changes do not update production until Netlify runs a build for that commit.

## Two ways a deploy starts

| Signal | Typical `deploy_source` | Meaning |
|--------|-------------------------|---------|
| Push to linked Git branch | `git` | Continuous deployment — merge to `main` triggers a production build when enabled |
| CLI, dashboard, build hook, API | `api` | Something outside the Git webhook started the build |

`manual_deploy: false` means the deploy was **not** a “Publish deploy” click in the UI. API-triggered builds are still automated; they are not necessarily tied to `git push`.

**Know your mode:** Netlify → **Site configuration → Build & deploy → Continuous deployment**. If the repo is linked and “Build on push” is on for `main`, merges should deploy without a separate trigger. If production only moves when you or a tool calls the API, treat `git push` as source control only until you deploy.

## Deploy contexts (build-time labels)

Set in `netlify.toml` and read in `apps/web/src/deployContext.ts`:

| Netlify context | Badge / env | Data mode label |
|-----------------|-------------|-----------------|
| Production | `production` | `production` |
| Deploy preview | `deploy-preview` | `aggregate-only` |
| Branch deploy | `branch-deploy` | `aggregate-only` |
| Staging | `staging` | `aggregate-only` |
| Local `npm run dev` | `dev` / unset | `synthetic-only` |

These labels are for UX and future server rules. They are **not** a security boundary until Functions enforce access.

## When to redeploy production

Redeploy when `main` contains UI, `netlify.toml`, headers, or env changes you want live.

Check alignment:

```bash
git log -1 --oneline origin/main
```

Compare that commit to the production deploy in the Netlify UI. If they differ, trigger a production deploy from `main` (or fix continuous deployment).

## Access (decision required)

**Current:** Team SSO login on the Netlify site — no password gate in the app.

**Today’s app data:** Plans live in **browser `localStorage`** with **synthetic starter fixtures**. Nothing in the public repo commits real campaign assumptions.

**Before real plans or classified data on production:**

1. **Who** can reach `wings-of-athena.netlify.app` (team SSO scope, invite list, future app-level auth).
2. **Whether** production stays opt-in deploy vs auto on every `main` merge.
3. **When** server-side enforcement replaces client-only `VITE_WINGS_*` labels (Blueprint §16).

Do not expand access or data classification by default.

## Security headers (already configured)

Global `noindex`, `no-store` on HTML, immutable cache on `/assets/*`, strict CSP. See `netlify.toml`. Revisit CSP `connect-src` when adding auth or a database API.

## Local parity

```bash
npm install
npm test
npm run build
npm run dev
```

For Netlify-like env locally: `netlify dev` (requires Netlify CLI and site link).

## Related docs

- [Blueprint §16](./BLUEPRINT.md) — deploy context contract
- [Data classification](./DATA_CLASSIFICATION.md) — what may never land in git
- [Roadmap](./ROADMAP.md) — persistence, auth, server enforcement (later)
