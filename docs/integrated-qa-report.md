# Integrated Main Branch Quality Audit — Patch 1 + Patch 2

## Goal and scope

This report covers Illinois Venture Radar after Pull Request #2 was **squash-merged into `main`**. It tests the actual combination of the original 29-company Research Park seed, Patch 1's evidence transparency/screening and Patch 2's official-source refresh, EnterpriseWorks and iVenture review workflow. Improvements are isolated on `quality/integrated-regression-hardening` and reviewed as PR #3 before being incorporated into `main`.

The app remains an independent **VC discovery and diligence tool for startups connected to the UIUC ecosystem**, not a university-owned or university-funded startup promotion directory. An incubation listing, iVenture participation, Research Park tenancy or official news item never automatically establishes university equity ownership, a company funding round or commercial traction.

## Test groups

| Group | What is asserted |
| --- | --- |
| Existing source evidence and production integrity | All 29 reviewed directory companies; supporting vs contradicting evidence; company source history and profile evidence; duplicate import idempotency; source-check dates separate from real events |
| Methodology and screening | Classification registry, weighted criteria, coverage threshold, zero/invalid weights, unmatched and conflicting claims, verified evidence requirement, fixed snapshots and lack of implied investment ranking |
| Original directory importer | Canonical HTTPS official URLs, allowed Startup + Tenant Directory classes, exact company profile paths, malformed URLs/HTML/entity decoding, unrelated news exclusions, source page identity, strictly bounded pagination |
| Robots policy and upstream failures | Respect relevant and most-specific user-agent groups, page-level disallow rules, longer Allow precedence, robots lookup errors, blocked/limited HTTP, no redirects, payload limits, bounded fetch retry behavior |
| Research exports | Financing sections correctly show sourced grant/revenue claims instead of false blanket unknown statements; only source-backed, public claims printed; rejects unsafe citation URLs; prevents spreadsheet formulas even behind Unicode whitespace |
| GitHub releases | Requires a verified Published repository mapping with supporting source; canonical GitHub URLs, no unrelated releases, no malformed event IDs/dates, accurate source history, unique signals and failed API handling |
| Patch 2 official connectors | iVenture cohort classification, EnterpriseWorks directory across six pages, official OTM identity checks, university news, NIH RePORTER and USAspending identity-gated awards |
| Source review and scheduling | Candidate staging does not publish, explicit approve/reject/create, atomic review transactions, foreign keys, duplicate and concurrent decisions, failed/blocked refreshes, lease recovery, UTC schedule and protected CLI |
| Integrated workflows | A common D1 database with all 29 seed records, multiple UIUC affiliation sources, pending news, reviewed dated signals, a separately admitted iVenture venture, unchanged source sector counts, private notes and screening behavior |
| Static and production bundle | TypeScript type checking, ESLint and framework production build on GitHub Actions, in addition to all Node/V8 SQLite regression tests |

## Root-cause repairs

### Original Research Park ingestion
- Centralized canonical original-source URL and profile-path checks; rejected query/fragment tampering, directory-as-profile and offsite sources.
- Fixed HTML entity decoding to handle malformed numeric values safely, without crashing; leaves unknown product descriptions empty rather than inventing claims.
- Enforced strict positive integer page ranges; unsupported values now fail explicitly instead of silently clamping or fetching unexpected pages.
- Implemented user-agent-aware robots policy matching with most-specific agent group, longest matching Allow/Disallow rule, and a preflight check of **every requested page** before sending source page requests.
- Detects conflicting duplicate slug identities rather than silently replacing a sourced company.

### Export integrity
- CSV generation treats whitespace-prefixed or Unicode-hidden spreadsheet formula strings as text.
- Reports render supported, published claims only; rejected/unverified and contradicting-only claims cannot become research assertions.
- Only HTTPS citation links with safe authority are rendered as Markdown links, and third-party source text is escaped.
- Source-backed grants and awards are described accurately as financing/awards; the report no longer falsely says no financing evidence exists when it does.

### GitHub release provenance
- Shared `core/github-policy.mjs` validates exact verified repository identity and release links before ingestion.
- Source evidence must explicitly support a factual Published repository claim; arbitrary or contradicting-only links do not qualify.
- Rejects mismatched repository releases, invalid dates, drafts, malformed IDs, unsafe source URLs and unexpected GitHub response schemas.
- Release persistence uses normalized event fields, stable deduplication keys, supporting evidence and a source history record.

## Verification and remaining boundaries

The workflow `.github/workflows/verify-methodology.yml` runs Node 22 SQLite tests with V8 JS instrumentation, TypeScript, ESLint and the production build on PR changes. See PR #3 and its **latest completed GitHub Actions run** for exact test count, head SHA and pass/fail details. A previous green test run covered **341/341 cases**, but the newer per-page robots tests and report exclusions require a final green run before merge.

V8 coverage is the coverage of files instrumented by Node's test runner (including test files), **not** a whole-application or browser/React UI figure. Neither successful GitHub Actions checks nor a merged GitHub PR changes the separately hosted private ChatGPT Site, its existing authentication, or its Cloudflare D1 database.

Before a deployed release, validate in staging: actual Cloudflare D1 migration and backup, trusted ChatGPT authentication, administrator authorization, keyboard/mobile interaction, source provider robots policies and current HTML/API contracts, and an authenticated approval/rejection cycle against real source evidence. Keep source refresh scheduling disabled until those manual checks are complete.

## Repository workflow

- **PR #2:** merged into `main` first, as requested. Its production seed remains intact.
- **PR #3:** adds this QA suite and cross-cutting repairs on a branch created from the post-Patch-2 `main`.
- No fixtures were substituted into the production import; all synthetic companies in test files remain isolated.
