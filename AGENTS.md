# Illinois Venture Radar — Vercel and Supabase only

- Frontend and API: native Next.js 16 App Router on Vercel.
- Auth: Supabase Auth, invitation-only; server routes verify `getUser()` before reading data; proxy refresh uses verified `getClaims()`.
- Data: PostgreSQL on Supabase, with managed SQL migrations in `supabase/migrations`.
- Private notes, watchlists, founder contacts, reports: `workspace` protected by user-specific Row Level Security. Never mix data across investor accounts.
- Administrator permissions: `investor_roles` table; no email matches, no client-defined role header.
- Collection jobs: authenticated admin routes and one daily Vercel cron route with `CRON_SECRET`. Respect source restrictions and manual reviews.
- All source claims need corresponding evidence and source URLs. The historical 243 candidates are pending observations, not published startups.
- Production settings are stored in Vercel/Supabase environment settings. Never commit secrets.
- Do not use old Cloudflare workers, D1, Zero Trust, ChatGPT Sites, extra MCP infrastructure, or unused UI scaffolding.
- Build, test and validate against the PostgreSQL CI service before merging. Production Vercel deployments are connected by the repository owner; GitHub merges don't provision accounts automatically.
- Read `README.md` and `docs/vercel-supabase-deployment.md` before changing infrastructure.
