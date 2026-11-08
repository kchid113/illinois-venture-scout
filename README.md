# Illinois Venture Radar

An independent, source-backed UIUC startup discovery and VC diligence application.

## Single production stack

- **GitHub** — version control and a single CI workflow.
- **Vercel** — native Next.js 16 application, API routes and scheduled source refresh.
- **Supabase** — PostgreSQL database, verified investor authentication, and private workspace Row Level Security.

No Cloudflare Worker, D1, Wrangler, Zero Trust or managed ChatGPT Sites dependencies.
Investor sign-in is invitation-only. Company evidence, startup discovery, filtering, comparisons,
watchlists, founder outreach, citations, source review and data export are preserved.

## Vercel and Supabase setup

Follow [docs/vercel-supabase-deployment.md](docs/vercel-supabase-deployment.md).
First connect an **isolated development Supabase project** to your Vercel preview.
Do not connect production until the PostgreSQL validation and separate-user security tests pass.

### Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=https://project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
DATABASE_URL=postgresql://postgres.project:password@pooler-host:6543/postgres
CRON_SECRET=random-32-characters-or-more
```

Never commit actual credentials. Public Supabase project URL and publishable key are intended for client-side use; DATABASE_URL and CRON_SECRET are server-only.

### Local development

Node.js 22.13+:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Create a Supabase project, copy the connection information into your local environment, then run:

```bash
npm run db:migrate
npm run db:seed
npm run db:verify
npm run typecheck
npm run lint
npm run build
```

The seed importer is **idempotent**: it starts with 29 vetted directory companies, preserves
source-linked evidence, adds 14 Research Park companies, and stages 243 official-directory
source observations for administrator review. The source snapshot was captured on
2026-11-04 and is not a verified census of active ventures. Do not substitute inferred
funding, founder contact, or commercial traction.

### Multi-user access

In Supabase Auth, disable public signup and invite investors from the dashboard. The email
sign-in page never creates users automatically. Grant an administrator by inserting the user's
UUID into the protected `investor_roles` table; do not grant admin by email or client-supplied input.
Private items use Supabase Auth user IDs and database-enforced RLS, independent of the frontend.

### Scheduled sources

Vercel schedules 12 individually bounded `GET /api/cron/refresh/<connector>` jobs with
`Authorization: Bearer $CRON_SECRET`: five Research Park pages, EnterpriseWorks,
iVenture, two university news sources, NIH RePORTER, USAspending and verified GitHub
releases. The weekly/daily jobs use source policies, PostgreSQL leases, idempotent
storage, and resumable enrichment checkpoints. Unreviewed funding/news/program
observations stay Pending. OTM is never automatically crawled and cannot run from
the admin refresh route. See the [production schedule](docs/vercel-supabase-deployment.md).

## Independent research methodology

Every claim links to its original source; classifications distinguish company-reported facts
from observed evidence. Unknown data stays unknown. A source directory listing does **not**
establish investment, university equity ownership, current operations, or commercial success.
All investor notes, watchlists, contacts, screenings and reports remain private.

The application is not owned, backed or endorsed by the University of Illinois.

## Security and release

CI builds Next.js, runs lint/typecheck, imports the real vetted snapshot into disposable
PostgreSQL twice, validates claim provenance, and tests RLS with two different investors.
No production database is modified by CI. See
[docs/vercel-supabase-deployment.md](docs/vercel-supabase-deployment.md)
for production cutover and existing private-data migration safeguards.
