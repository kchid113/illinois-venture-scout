# Illinois Venture Radar

**Discover Illinois-connected startups, understand the evidence, and organize better research.**

Illinois Venture Radar is a research application for exploring companies connected to the University of Illinois innovation ecosystem. Its goal is to turn scattered directory listings and company developments into a searchable, traceable workspace for investors, founders, students, and ecosystem researchers.

Every important claim should answer three questions: **What is being claimed? Where did it come from? What remains unknown?** The platform keeps sources and supporting excerpts alongside company records, separates company-reported statements from documented facts and analyst interpretation, and explains how its classifications and screening calculations work.

> Illinois Venture Radar is an independent research project. It is not affiliated with or endorsed by the University of Illinois. Screening results express alignment with user-entered criteria and do not predict investment returns.

## Project goals

- **Make discovery useful:** find companies by their documented products, sectors, and ecosystem relationships.
- **Make research auditable:** connect claims to original sources, publication and retrieval dates, excerpts, verification classifications, and conflicting evidence.
- **Make uncertainty visible:** show missing information as unknown; never guess funding, stage, traction, or university ownership.
- **Support a repeatable workflow:** save watchlists, private notes, searches, comparisons, reports, and reproducible screening snapshots.
- **Build toward responsible monitoring:** add reviewed source integrations and event updates while preserving provenance and avoiding invented signals.

A Research Park tenancy or EnterpriseWorks participation establishes a specific ecosystem relationship. Neither automatically establishes a university spinout, university ownership, or investment readiness.

## Typical workflow

1. Search and filter company records in **Discover**.
2. Open a profile and inspect the original evidence behind a sector, relationship, or product description.
3. Save companies to a watchlist, record private diligence notes, and compare two to five companies.
4. Enter research criteria and editable weights. Inspect each screening contribution and save an evidence snapshot.
5. Export a cited Markdown report or comparison for further research.

Information buttons throughout the app explain definitions, rules, source requirements, limitations, and freshness. The **Data Methodology** page publishes the versioned classification and metric registry.

## Current release

The initial dataset contains **29 real companies, 101 supported claims, and six original source URLs**, imported from official Research Park directory pages and selected profiles. These are a documented starting sample, not a census of Illinois startups. Company descriptions remain company-reported; funding, stage, business model, and commercial traction are often unavailable.

The application runs as a private, authenticated Sites deployment. This repository contains the application source, schema, reviewed initial import, tests, and setup documentation. The hosted database and private user research are separate from the repository. Deploying this repository alone does not copy live user data or provision credentials.


## Implemented product

- A deployed, database-backed research application, not a static company dataset in the UI.
- Discovery search across published claim values; sector and affiliation filters; alphabetical/recent sorting; pagination; table and card views.
- 29 real startup directory records from three Research Park pages; the three specifically requested individual profiles were separately inspected and their website links recorded. No synthetic production companies.
- Source, claim, evidence, affiliation, history, signal, ingestion job, review queue, audit, and user workspace tables with migrations, foreign keys and unique indexes.
- Inline citations, accessible evidence drawer, original URLs, retrieval/check/publication dates, explicit unknowns, reported descriptions, and conflict preservation.
- Multiple watchlists, private notes, workflow statuses, saved searches, thesis criteria, editable Markdown reports, and 2–5-company comparison with CSV/Markdown exports.
- Manual directory ingestion, reviewed initial import, protected one-page refresh, job failures and repeat-safe imports.
- GitHub releases adapter and protected ingestion action, gated on an existing source-backed repository identity claim. No company mappings have been verified yet; no engineering signals were invented.

## Stack and important departure from the requested preference

This implementation uses React 19, TypeScript, Next.js App Router APIs through the Sites-supplied **Vinext** runtime, Tailwind CSS, Radix Dialog, Drizzle, and **Cloudflare D1 (SQLite)**. Sites hosts the Worker, provisions the database, and supplies trusted sign-in identity headers. Dependencies are pinned by `pnpm-lock.yaml`.

It is **not a PostgreSQL/Prisma deployment** and is **not currently Vercel-compatible**. Docker Compose/PostgreSQL migrations are not supplied because they would not run this application as implemented. A Vercel/Supabase port requires replacing `lib/radar.ts`, D1 batch writes, the schema dialect, Cloudflare imports, and Sites identity with a verified application session. Do not deploy this Worker behind an untrusted proxy that permits clients to forge the Sites identity headers.

## Local development

Node >=22.13 (Node 22's built-in SQLite test module is used). Install using the supported Sites dependency helper or `pnpm install --frozen-lockfile` in a standard environment.

```sh
pnpm build
# Apply the schema once to the local database:
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_first_drax.sql
# Prepare and apply reviewed initial data:
pnpm seed
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file data/seed.sql
pnpm dev
```

In ChatGPT's managed environment use `sites-preview start <absolute-project-directory>` rather than starting a second preview server. Local and deployed databases are separate. `.dev.vars` can contain local secrets; it is ignored by Git. See `.env.example` for key names. Anonymous local research is clearly labeled **Device-local** and remains in that browser. Signed-in hosted research is stored in D1 under the trusted Site-specific user ID. The current publication is private to its owner.

## Data ingestion and refresh

```sh
pnpm ingest -- 3    # Fetch pages 1–3, up to a hard maximum of 5
pnpm seed          # Prepare SQL from reviewed data/import.json and profile-evidence.json
```

The directory adapter checks robots.txt, waits at least 10 seconds between requests, identifies itself, enforces HTTPS/fixed origin, rejects redirects, bounds payload size, uses timeouts and bounded server-error retries, and stops on 403/429. If robots.txt is unavailable, it fails closed. Do not lower the polite request interval or bypass restrictions. Network source text is untrusted; HTML is stripped and never rendered as HTML. The initial directory snapshots were fetched live on November 1, 2026. Individual profile records were inspected through the web retrieval tool on the same day. Short supporting text and metadata are retained, not full raw articles.

Extraction requires both **Startup** and **Tenant Directory** taxonomy. News-only posts and corporate-only tenants are excluded. EnterpriseWorks is assigned only from the explicit category. Social links, contact preambles and unrelated embedded news are excluded. A conservative parser deliberately leaves many descriptions blank rather than misattribute text. Review `data/import.json` before applying new CLI imports. `data/profile-evidence.json` records the separately inspected profiles, not automatically discovered financial facts.

The protected administrative endpoint supports:

- `POST /api/admin {"action":"seed"}`: initial reviewed source import, idempotent.
- `POST /api/admin {"action":"refresh"}`: refresh directory page 1; the same adapter powers the CLI.
- `POST /api/admin {"action":"reject","claimId":"…"}`: retain the claim but reject it and audit the correction.
- `POST /api/admin {"action":"github","claimId":"…"}`: retrieve public releases only for a reviewed published `repository` claim with evidence.
- `GET /api/admin`: jobs, conflicting/pending claims, broken sources and audit records.

Administrative authorization requires either the configured `ADMIN_EMAIL` in a trusted Sites session or a >=32-character `ADMIN_TOKEN` bearer token. Browser mutations also validate Origin. Server secrets never enter the client bundle. The UI uses the signed-in administrator account; CLI automation can use the token. When calling a private Site from a service, Sites' separate `OAI-Sites-Authorization` header is also required. Obtain that supported service credential through Sites, never put it into source control or a schedule prompt.

No unattended refresh schedule was configured. The CLI can be invoked by a job runner independently of a browser. GitHub documentation reviewed: https://docs.github.com/en/rest/releases/releases and https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api. Public releases need no API key; unauthenticated quota is 60 requests/hour. The connector stops on API failures and preserves original release dates and source IDs. Never create a repository mapping by name similarity alone.

## Schema and provenance

See [docs/schema.md](docs/schema.md), [db/schema.ts](db/schema.ts), and [drizzle/0000_first_drax.sql](drizzle/0000_first_drax.sql).

Imports are transactional per company in D1. Identity is keyed to the canonical source-profile slug. Claims deduplicate on company+predicate+value. Evidence joins claims to sources, preserves extraction method and short supporting text, and deduplicates claim/source pairs. Conflicting values are kept and visibly labeled rather than overwritten. Public queries require an evidence record and published/conflicting status. Unknown metrics have **no invented claim**, rather than a zero or guessed stage. Source history uses normalized record hashes for the initial snapshots and page content hashes on subsequent automated crawls. It is observation history, not a complete historical archive.

Directory descriptions are **Company-reported**, even though reproduced by a university directory. Listing identity, taxonomy and university relationship are verified against the listing, not against independent corporate records. Absence of public funding data is not evidence of bootstrapping. No verified financial/product/commercial signals were imported. The feed therefore correctly starts empty.

Search is parameterized SQLite LIKE/EXISTS over stored data, with bounded inputs and pagination; no external fetch occurs while rendering public pages. It is not a full-text relevance engine. Research writes are user-scoped and validated with Zod. Exports retain original source links, and CSV cells neutralize leading formula operators.

Thesis fit uses editable weights (35/20/25/20 initially). Unknown or unspecified factors reduce coverage and are excluded from the normalized fit numerator/denominator. Scores are withheld below 50% unrounded coverage. Only published, evidenced factual/company-reported claims are eligible; conflicts remain unknown. Methodology version 1.2.0, exact contributions and evidence snapshots are available in the UI. The shared registry is `core/methodology.mjs`; see [Patch 1 report](docs/patch-1-report.md). This is keyword/sector screening, not investment advice, valuation, or a return forecast.

## Validation

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Tests use Node's deterministic test runner and an isolated in-memory SQLite database rather than Vitest. Network responses in unit tests are mocked. Browser workflow checks were performed using the managed browser's Playwright-compatible interface; see [docs/implementation-report.md](docs/implementation-report.md). No unattended Playwright runner is configured.

## Deployment

The tracked `.openai/hosting.json` declares the private Site and D1 binding. Build with the Sites `build-site.mjs` helper, push the exact source commit through `site-workflow.mjs`, package its output, and publish that commit/archive with `save_version_and_deploy_private`. Sites applies schema migrations before publishing the Worker. Configure `ADMIN_EMAIL` and a random `ADMIN_TOKEN` with the Sites environment-variable tool. Initialize the hosted DB via the protected reviewed seed action after deployment. Never put data backfills in schema migrations.

## Explicitly incomplete

PostgreSQL/Prisma/Docker/Vercel portability; advanced stage/business-model/evidence/date/watchlist filters; all-company thesis ranking (the UI screens the first page); administrator merge and candidate-approval UI; comprehensive broken-link checker; automated scheduled jobs; robust historical cutoff queries; grant/publication/patent integrations; verified GitHub company mappings; AI research assistant; dark mode; report print view; exhaustive mobile E2E coverage. Source coverage counts are supported claims, not a claim of complete diligence.


### Methodology audit refinements (v1.2.0)

The `feature/methodology-tooltips` branch tightens public claim/search/sector counts and thesis scoring to require **supporting** evidence, not merely any linked citation (including contradicting-only links). The research profile now reads source-backed lifecycle, founder, equity-funding, grant/contract, and traction fields when they exist, rather than hard-coding unknown values; generic untyped `funding` is not treated as a confirmed equity round or grant. It distinguishes system-derived affiliation and verification labels from source-reported sector taxonomy. The Methodology page and contextual popovers remain linked from navigation. See [Patch 1 audit notes](docs/patch-1-report.md) for test scope and limitations.
