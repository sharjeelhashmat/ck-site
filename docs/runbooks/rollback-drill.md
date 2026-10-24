# Rollback drill on staging (owner runs it)

Proves that `.github/workflows/rollback.yml` can put the previous version of the site Worker back, and that you can roll
forward again. Run it on `ck-site-web` while it is still the staging site (noindex), so nobody outside sees the old
version. Nothing here touches D1: the rollback workflow never does.

## 0. Before you start

You need two versions of `ck-site-web`: the one live now, and an older one to go back to.

1. Actions > deploy-site > the most recent successful run > run summary. Note **LAST_GOOD** (the version that was
   live before that deploy) and **new version** (the one live now).
2. If there is only one deploy so far, run deploy-site once more (public off) and use that run's two values.

## 1. Roll back

Actions > rollback > Run workflow, branch `phase2-site`:

- target: `ck-site-web`
- version_id: the LAST_GOOD from step 0
- reason: `rollback drill`

Approve the `production` environment when GitHub asks.

## 2. Expected result

The run is green and its summary shows:

- **BEFORE**: the version that was live (the "new version" from step 0);
- **AFTER**: exactly the version_id you entered (the workflow re-reads it for up to 60 s and fails if it does not change);
- **Smoke**: every page returns 200 and robots.txt returns 200.

A red run changes nothing silently: its summary says which step failed and what is live.

## 3. Confirm the previous version is serving

Any one of these:

- Cloudflare dashboard > Workers & Pages > `ck-site-web` > Deployments: the active version is the version_id you entered.
- From `site/` on your computer: `npx wrangler deployments status --name ck-site-web` shows that version at 100%.
- Open https://ck-site-web.sharjeelhashmat.workers.dev/ and check that a change made in the newer deploy is gone.

## 4. Roll forward

Either:

- Actions > rollback again, target `ck-site-web`, version_id = the BEFORE value from step 2, reason `roll forward after
  drill`; or
- Actions > deploy-site (public off), which builds `phase2-site` and deploys it as a new version.

Then repeat step 3 and check that the newer version is active again.

## Worker

The same drill works for `ck-lead-worker` (target `ck-lead-worker`, values from the deploy-worker run summary). Its smoke
test checks `/health`, CORS on `/lead` and `/api/newsletter/subscribe`, and `GET /unsubscribe` (400). Only drill the
Worker when no enquiry is expected: for a minute or two the older code serves the forms.
