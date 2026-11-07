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
- Configure Email (Magic Link) and Invite email templates using a **token hash**:
  `https://YOUR_VERIFIED_APP_ORIGIN/auth/callback?token_hash={{ .TokenHash }}&type=email`
  for regular email magic links. For invitation links use `type=invite` and update the
  callback route to accept the invite type, as implemented. Alternatively use the PKCE `code`
  callback provided by Supabase; both paths are handled.
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

## 5. Production launch and rollback

- Before attaching a production domain, require a green native Next.js build,
  Postgres source-integrity tests, real sign-in and two-account isolation checks,
  admin review actions, manual source refresh, cron auth checks, responsive browser
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
