# Illinois Venture Radar

Independent, source-backed startup discovery and VC diligence for the University of Illinois Urbana-Champaign ecosystem.

## Option B: publicly accessible, no visitor login

**Open the Vercel URL to browse the site.** Startup discovery, company profiles, search, filters, comparisons, original evidence, methodology, and activity feed do not need a Supabase account or sign-in link.

Personal research (watchlists, notes, founder contacts, saved searches, thesis, screening snapshots, reports) is saved **only to the visitor's browser localStorage**. It is not uploaded to Supabase, will not sync across devices, and can be lost when browser storage is cleared. Settings includes export/import of a JSON backup. Treat browser-local research as private only to the extent that the device/browser profile is private: it is not encrypted or protected from other users of that profile.

## Single production architecture

- **GitHub** — source and CI.
- **Vercel** — native Next.js 16 frontend, server-side read APIs and scheduled collection.
- **Supabase** — PostgreSQL containing shared, reviewed source-backed facts and the protected administrator/legacy workspace tables. The public browser reads source-backed facts through server-only Next.js endpoints, **not** through Supabase's Data API.

Cloudflare, Wrangler, D1, Zero Trust, ChatGPT Sites, and investor sign-in are not required.

## Configure the deployment

See [docs/vercel-supabase-deployment.md](docs/vercel-supabase-deployment.md). Required production configuration for the public site:

```
DATABASE_URL=postgresql://postgres.project:password@pooler-host:6543/postgres
CRON_SECRET=generate-a-unique-random-secret-at-least-32-characters
```

`DATABASE_URL` must be the **server-only** Supabase transaction pooler URL. `CRON_SECRET` protects the twelve scheduled source refresh routes. Never put either in `NEXT_PUBLIC_*` or commit real credentials. The existing Supabase Auth publishable URL/key can remain configured for separate administrative tooling; visitors never use them.

### Local development

Node.js 22.13+:

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run db:seed
npm run db:verify
npm run typecheck
npm run lint
npm run build
npm test
npm run dev
```

Use an isolated preview Supabase project and a separate production project. The idempotent importer begins with 29 vetted companies, adds 14 Research Park companies and stages 243 source observations as Pending. The snapshot is not a census of active companies.

## Security boundaries

- Public: `GET /api/data` with supported summary, company, sources, signals, and company-search views.
- Browser only: personal research in `ivr-public-workspace-v1` localStorage; old server workspace reads and writes are explicitly denied.
- Protected: `/api/admin/*` still checks a Supabase-authenticated administrator role in `investor_roles`, but **no admin sign-in or admin controls are exposed through the public UI**. Use trusted administrative tooling for review tasks; the public website cannot perform them.
- Protected: `GET /api/cron/refresh/<allowlisted-connector>` checks `CRON_SECRET` with timing-safe validation.
- Database: source tables are denied to Supabase Data API roles; retained Supabase `workspace` data has per-user RLS and is never published or moved to browser localStorage automatically.

Previously saved Supabase investor research stays in Supabase; it is **not automatically transferred** to the public browser and must not be published. If it must be transferred later, do so by verified, consented export.

## Scheduled source collection

Vercel schedules twelve bounded source jobs covering five Research Park pages, EnterpriseWorks, iVenture, two news feeds, NIH RePORTER, USAspending and verified GitHub releases. Pending findings still require human review. The OTM directory must not be automatically crawled; its original manually observed source snapshot remains available.

## Methodology

Every published claim requires original evidence. Directory affiliation is **not** evidence of UIUC equity ownership, university funding, active operations or commercial traction. Unknown data remains unknown. The application is independent and not endorsed by the University of Illinois.
