# Implementation report — November 1, 2026

## Delivered

A functioning Sites-hosted full-stack application backed by D1, with 29 real Illinois Research Park startup records. The initial dataset contains 101 material claims with evidence, six source records (three directory pages and three company profiles), and no fabricated financial metrics or signals. Directory retrieval was live, respecting the site's 10-second crawl delay. AgAnswers.ai, Archean Sciences and HexaF Innovations profiles were individually inspected.

The UI supports overview metrics, paginated search/filter discovery, company profiles, clickable evidence drawers, source metadata, watchlists, notes, research status, saved searches, comparisons, editable reports and Markdown/CSV export. Basic thesis screening exposes weights, missingness and evidence. All non-AI features operate without an OpenAI key.

Signed-in research writes are isolated by Site user ID. Anonymous development uses a labeled browser-local fallback. Admin actions require a server-configured administrator identity or bearer token; browser writes verify Origin. The publication is private to the owner.

## Verification

- TypeScript no-emit check: passed.
- ESLint full source tree: passed.
- 16 deterministic Node unit/integration tests against isolated SQLite: passed (import correctness, repeat safety, timestamps, conflicting values, unknowns, source links, affiliation boundaries, failed requests, SSRF, thesis missingness, export provenance, citation-ID validation, entity-match gating, GitHub event deduplication, user-scope uniqueness).
- Production Worker/client build: passed.
- Live directory import: passed, 29 distinct startups.
- GitHub public releases endpoint smoke: passed against GitHub's own docs repository; this verifies API connectivity, **not a company repository match**. No company was enriched from that smoke response.
- Browser checks via managed Playwright interface: dashboard loads real metrics; discovery search finds AgAnswers.ai; citation drawer opens the correct source; bookmarking persists through navigation; private local notes survive reload; two-company comparison preserves citations and unknown funding/stage. The initial compile/hydration took time in development; subsequent routes worked.

## Credentials and limitations

`ADMIN_EMAIL` and `ADMIN_TOKEN` protect ingestion and corrections. Sites supplies authenticated user identity and the D1 binding. GitHub's public releases adapter does not require a key, but it refuses enrichment without a reviewed, source-backed repository claim. None is present in the initial dataset.

This is an initial working release, **not the complete 22-section specification**. The stack differs from the preference: Vinext/Drizzle/D1 rather than standard Next.js/Prisma/PostgreSQL. Vercel/Supabase portability and Docker PostgreSQL setup are not implemented. The report does not claim those targets are deployable.

Other incomplete items: AI assistant, grants/patents/publications integrations, scheduled refreshes, point-in-time historical screening, advanced filters, admin merge/approval UI, comprehensive link checking, all-company thesis ranking, print reports and exhaustive responsive automated E2E. The signal model, feed and GitHub event importer work, but the initial production signal feed intentionally remains empty because no verified company events were imported. No monetary estimates or claimed commercial momentum were substituted for missing evidence.

## Production smoke verification

Private deployment succeeded at https://illinois-venture-radar.youngburl.chatgpt.site . The hosted seed action succeeded. Live database queries returned **29 companies, 101 supported claims, 6 sources, 0 signals, 0 conflicts**. Search for AgAnswers returned one company. Requests without application administrator credentials received HTTP 401 at `/api/admin`; service requests without a signed-in user received HTTP 401 for private research writes. The public browser encountered the expected ChatGPT sign-in gate; signed-in production browser workflows were not exercised in this session.
