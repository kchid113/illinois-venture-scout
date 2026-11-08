# Vercel + Supabase deployment and data migration

This is the only supported production architecture. No Cloudflare services are required.

## 1. Provision isolated resources

1. Create a **development Supabase project**. Set its region near the intended Vercel function region.
2. Use Supabase Connect → **Transaction pooler** for server-only `DATABASE_URL`.
3. Copy the project URL and **publishable key** into Vercel Preview environment variables.
4. Connect GitHub repository `kchid113/illinois-venture-scout` to a Vercel project using Next.js preset.
5. Configure the four variables in `.env.example`. Separate **Preview** and **Production**
   values; never point Vercel previews at production user data.
6. Apply the versioned PostgreSQL migration using `npm run db:migrate` against development
   first. Only an authorized operator runs production migration and `db:seed`.
7. Run `npm run db:verify`, confirm the database has **43** source-backed directory companies
   and **243** pending source observations, and inspect original evidence links.

## 2. Authentication and invitation-only login

- In Supabase Authentication, turn off public signups. Invite approved investors using
  Supabase Auth user management.
- Configure Auth URL settings for both the production origin and preview auth callback.
- **Staging does not require a custom SMTP service or editable email templates.**
  The app's browser-side `/auth/callback` supports the default hosted
  `{{ .ConfirmationURL }}` email template (which can return credentials in the
  URL fragment), PKCE `?code=` callbacks, and explicit `token_hash` callbacks.
  Do not use the previous server-only callback: it cannot read URL fragments.
- For production, configure a verified sending domain and supported email delivery;
  use the optional token-hash email template where appropriate. The email
  template may use `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`
  for magic links and `type=invite` for invitations.
- Always test with a fresh link. A magic link is single-use, commonly expires
  within one hour, and a link opened by automated email scanners can be
  consumed. For PKCE callbacks, use the same browser profile where the sign-in
  request originated. Never paste URLs containing `code`, `token_hash` or
  `access_token` into chat, logs, issue reports, or screenshots.
- Register only your trusted Vercel preview/production redirect URLs. Never allow arbitrary
  redirect destinations from user input.
- In Supabase SQL Editor, insert an administrator role:
  `INSERT INTO investor_roles(user_id,role) VALUES ('<real-auth-user-uuid>','admin');`
  The auth account must already exist. This is an intentionally manual privileged operation;
  public signup, arbitrary email matching and client-side role assignment are prohibited.

## 3. Private research and Row Level Security

All public company/sources/candidates tables are **denied** through Supabase's Data API.
They are exposed only by authenticated Next.js API handlers, using the server-only pooler URL.

`workspace` uses Supabase Data API with the authenticated user's access token.
Postgres policies restrict SELECT, INSERT, UPDATE, DELETE to `auth.uid()=user_id`.
`investor_roles` is not readable/writable by anonymous or investor accounts.

The GitHub CI integration suite tests real RLS queries for two distinct user UUIDs,
rejected cross-tenant writes, and anonymous access denial. Keep these checks on every PR.

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

## 6. Production launch and rollback

- Before attaching a production domain, require a green native Next.js build,
  Postgres source-integrity tests, real sign-in and two-account isolation checks,
  admin review actions, manual and scheduled source refresh, cron auth and cursor checks, responsive browser
  navigation, downloads, founder contact, watchlist and notes functionality.
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
