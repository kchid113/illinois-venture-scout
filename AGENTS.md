# Illinois Venture Radar — public Vercel + Supabase application

- Native Next.js 16 App Router on Vercel; PostgreSQL on Supabase via server-only `DATABASE_URL`.
- **Option B is active:** visitors never sign in. Home, discovery, company profiles, activity, sources, compare, research and settings are public.
- Shared source-backed company facts are read by unauthenticated `GET /api/data` through the server-only Postgres connection. No public direct Supabase Data API grants.
- Visitors save personal watchlists, contacts, notes, screenings, reports and searches only to versioned browser localStorage in `core/local-workspace.mjs`. Do not reintroduce `/api/data` workspace writes or silently sync browser data to Supabase.
- Browser localStorage is not secret storage; users must be warned about shared devices and data loss. Preserve export/import portability.
- Administrator routes remain separately protected using Supabase Auth plus `investor_roles`, but public UI does not expose admin login or controls. Never open admin writes to anonymous visitors.
- Vercel cron uses allowlisted connector routes and `CRON_SECRET`. Only administrators review pending candidate observations; source imports remain review-first.
- All source claims need original evidence URLs. The 243 historical candidates are pending observations, not published startups. Never infer university investment, ownership, or fundraising.
- No obsolete Cloudflare, D1, Zero Trust, ChatGPT Sites or unused boilerplate.
- Run GitHub CI (Next.js typecheck/lint/build, real PostgreSQL/RLS integration and unit tests) before merging.
- Read `README.md` and `docs/vercel-supabase-deployment.md` before changing infrastructure.
