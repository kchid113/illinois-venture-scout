# Vercel + Supabase deployment — public visitor mode (Option B)

This is the only supported production architecture. No Cloudflare services or visitor sign-in are required.

## 1. Configure independent preview and production resources

1. Create an **isolated development Supabase project** near your Vercel region, then connect Vercel Preview to that project.
2. Set server-only `DATABASE_URL` to the Supabase **Transaction pooler** connection URI in Vercel. Do not use `NEXT_PUBLIC_DATABASE_URL`.
3. Connect `kchid113/illinois-venture-scout` to Vercel with Next.js preset, and set the production `DATABASE_URL` to the production Supabase project.
4. Set production `CRON_SECRET` to a random secret with at least 32 characters. Configure preview secrets separately.
5. Apply managed SQL migration with `npm run db:migrate` and seed the authorized target once with `npm run db:seed`.
6. Run `npm run db:verify` to confirm the expected **43** source-backed companies and **243** Pending observations, then verify source URLs.
7. Disable Vercel Deployment Protection for the intended public Production deployment; previews may remain protected.

## 2. Public browsing and browser research

- Every visitor can open the production URL and use `/`, `/discover`, `/companies/[slug]`, `/activity`, `/watchlists`, `/compare`, `/research`, `/sources`, `/methodology` and `/settings` without a login.
- Retired `/login` and `/auth/callback` paths redirect to the homepage.
- The public `GET /api/data` accesses reviewed PostgreSQL records through the server-only pooler; server workspace queries and writes are denied.
- Watchlists, research statuses, notes, founder contacts, searches, theses and reports are stored in the visitor's browser at `localStorage['ivr-public-workspace-v1']`. They are **not** uploaded to Supabase or synced across devices. Settings provides JSON backup export/import and deletion.
- Local storage is not encrypted or user-isolated on a shared browser profile. Do not store sensitive diligence on public/shared devices; browser clearing can erase it.
- Existing Supabase private workspace records are **retained but not surfaced**. Never copy historical private research into a public API or another user's browser.

## 3. Administrative and Supabase security

- The original Supabase `workspace` table retains `auth.uid()=user_id` RLS and authenticated-only grants. Public users never access it.
- Public companies/sources/claims/candidates tables remain denied to Supabase's Data API, including `anon` and `authenticated` roles; the Next.js server uses its private PostgreSQL connection for reviewed read-only responses.
- `/api/admin/*` operations continue to require a verified Supabase Auth identity **and** the `investor_roles` admin row. They cannot be invoked anonymously, and there is no admin login UI on the public website. Use separately authorized database and operational tooling to manage review until a dedicated administrative interface is provided.
- Scheduled imports use `CRON_SECRET` bearer authentication; do not expose that value in the browser. Anonymous users cannot trigger source collection.
- No database schema change or public RLS policy is needed for visitor mode.

## 4. Source catalog and migration safety

The repository contains the original reviewed `data/import.json` and
`data/profile-evidence.json`, the original source catalog manifest, and an idempotent,
PostgreSQL-compatible `data/catalog-additions.pg.sql` snapshot. A fresh target should
contain 43 directory companies and 243 Pending observations; some names represent repeated
program connections, not unique investable companies.

Data migrations retain stable source, claim, evidence, and company IDs; no claim is published
without original evidence. Candidate decisions are single-use and transaction-guarded.

**Existing investor research cannot be automatically carried over from older systems.**
Before switching an existing production application, export its private workspace data and
obtain the owner's verified consent. Map each old account to a real new Supabase Auth user UUID,
preserve every note, contact, saved search, and watchlist, and verify the import account by
account. Browser-local storage requires an opt-in export/import and is not available to a
server-side migration. Keep a read-only backup until reconciled. Never copy investor data
between accounts by matching an unverified email address.

## 5. Expanded automated source coverage

The production app has 12 separate, staggered and secret-protected Vercel
Cron Jobs. The allowlisted connector paths and UTC schedules live in
`core/source-schedule.mjs`, and CI verifies that `vercel.json` exactly matches.

| Source | Cadence | Review/security requirement |
| --- | --- | --- |
| Research Park startup directory pages 1–5 | Each page weekly, Mon–Fri | Direct evidence-backed directory records; identity conflicts held for human review |
| EnterpriseWorks | Weekly Tuesday | New accelerator observations stay Pending |
| iVenture | Weekly Saturday | Cohort observations stay Pending |
| Research Park news | Daily | Exact documented company mentions, queued for review |
| Entrepreneurship at Illinois news | Daily | Exact documented company mentions, queued for review |
| NIH RePORTER | Weekly Tuesday | Only separately verified NIH organization identities; awards stay Pending |
| USAspending | Weekly Thursday | Only separately verified UEI identities; awards stay Pending |
| GitHub releases | Daily | Only verified repository identities; source-backed engineering signals |

The OTM startup directory is excluded from *all* automated fetching—including
the admin API—because its robots/access restrictions require manual handling.
The original reviewed, manually collected source snapshot remains available.
Do not override provider robots restrictions or search funding recipients by
similar company names.

Enrichment sources use **resumable batches of five verified mappings** and an
RLS-denied `refresh_cursors` table. A cursor advances only after one identity's
records have been fully processed; later runs wrap at the end. Apply the
additional versioned PostgreSQL migration with `npm run db:migrate`
before deploying the new cron configuration.

The ingestion layer retains database leases to prevent overlap, idempotent
source/claim/evidence operations, single-decision candidate review and
persisted audit/job records. Failed jobs appear in Settings.
Transient network failures and HTTP 500/502/503/504 may retry at most twice
with modest delay; 403, 429, robots blocks and malformed sources never
trigger an aggressive retry loop.

The routes are under `/api/cron/refresh/<allowlisted-connector>` and require a
32+ character Vercel Production `CRON_SECRET` bearer token. Invalid or
manual-only connectors cannot run from the cron endpoint. Production cron
functions use a maximum duration of 300 seconds and UTC scheduling.
The 12 jobs fit Vercel's 100-jobs-per-project limit. Each individual
schedule runs at most once daily, compatible with the Hobby cron cadence
restriction, although commercial use requires an eligible plan.
See [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) and the
[January 2026 expansion](https://vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan).

Before launch, use a deployed authenticated environment to check source runs,
403 with a wrong cron bearer, 404 for OTM/unknown source, failed-job logging,
cursor resume after a failed mapping, review-only staging, robot blocks,
source API throttling and zero-eligible-identity results. Do not claim
source coverage is complete if a provider returns 0, a forbidden response,
or a known incomplete dataset.

## 6. Test the deployed data connection

1. Open `https://<deployment>.vercel.app/api/health`; successful healthy output includes `status: ready` and a nonzero company count.
2. Open `https://<deployment>.vercel.app/api/data?view=summary` to verify the number of companies, evidence and original sources. `signals: 0` is expected until reviewed events exist.
3. Run the manual GitHub Actions workflow `Verify public Vercel deployment data` against that deployment URL. It exercises health, summary, discovery, company detail, evidence links and private-workspace denial, without writing to Supabase.
4. A Vercel build success does **not** prove the `DATABASE_URL` environment variable is configured at runtime. HTTP 503 `database-unavailable` means inspect the Vercel environment-scoped pooler connection settings. HTTP 503 `published-data-empty` means verify which Supabase project Vercel targets. Never expose the database connection string to the browser or re-seed an unverified target.
5. Keep Vercel deployment protection turned off for the intended public production URL, while staging previews may remain private.

## 7. Public production launch and rollback

- Before attaching a production domain, require a green native Next.js build,
  Postgres source-integrity tests, real sign-in and two-account isolation checks,
  admin review actions, manual and scheduled source refresh, cron auth and cursor checks, responsive browser
  navigation, downloads, founder contact, browser-local watchlist, notes and research-backup functionality.
- Configure `CRON_SECRET` as a random 32+ character value in Vercel Production;
  rotate it if leaked. Vercel Cron sends it as a bearer token.
- Keep the previous system **disabled or read-only** for a short rollback window.
  Do not run two ingestion schedulers against the same database.
- Rollback Vercel code by redeploying the previous successful build; database rollback
  requires a tested backup and must not silently overwrite investor writes.
- Delete old external infrastructure **only after** verifying data portability and
  access control; repository cleanup removes code but cannot delete accounts on your behalf.

Official sources:
- https://supabase.com/docs/guides/auth/server-side/nextjs
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://vercel.com/docs/cron-jobs
