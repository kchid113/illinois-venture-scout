# Patch 2 — Public-source refresh and UIUC venture ecosystem discovery

## Product purpose

**Illinois Venture Radar is an independent venture-capital discovery and research workspace, not a university promotional directory.** It helps VCs find UIUC-ecosystem companies that may be independently founded, founded by students or alumni, located in Research Park, listed at EnterpriseWorks, part of iVenture, or connected through university research, IP commercialization or financial support.

**Inclusion is not a claim of university ownership, endorsement, funding received, or investment merit.** These are distinct, potentially overlapping evidence-backed relationships. An EnterpriseWorks listing does not imply a spinout. An iVenture cohort may include a nonprofit venture. A Research Park tenant may be commercially independent of the university. University equity ownership/backing is never inferred from participation.

## Implemented source integrations

| Connector | Official source | Integration behavior |
| --- | --- | --- |
| Research Park startup directory, pages 1–3 | https://researchpark.illinois.edu/category/tenant-directory/startup/ | Existing cautious import; refuses mismatched identities and creates review queue entries instead |
| **EnterpriseWorks Incubator**, up to six directory pages | https://researchpark.illinois.edu/category/tenant-directory/enterpriseworks-incubator/ | Finds incubator-category companies, including those not also tagged `Startup`; creates **pending** exact company match or pending unmatched profile; admin approval required to publish a sourced incubator relationship or create a new company |
| **iVenture Accelerator** cohorts | https://iventure.illinois.edu/startups | Parses official cohort page; matches existing companies by normalized full name; unmatched ventures require source-linked website and explicit admin review before adding |
| Research Park news | https://researchpark.illinois.edu/news/ | Stages official article/company title mentions for review; only dated reviewed news may become a development signal |
| Entrepreneurship at Illinois news | https://www.entrepreneurship.illinois.edu/news/news-and-info | Stages reviewed title/company mentions |
| OTM startup list | https://otm.illinois.edu/browse-technologies-startups/startups | Creates review-only university-IP startup candidates |
| NIH RePORTER | https://api.reporter.nih.gov/v2/projects/search | Attempts awards only for separately evidenced exact organization identities; nonmatches excluded |
| USAspending | https://api.usaspending.gov/api/v2/search/spending_by_award/ | Attempts awards only for previously sourced UEI mappings; no similarity-only recipient matching |
| GitHub releases | https://api.github.com/ | Existing GitHub release integration, only for a source-backed company repository identity |

**Not connected:** SBIR.gov direct API (provider under maintenance as of implementation); OpenAlex, private funding databases and broader statewide startup sources. Those are not simulated or advertised as live.

All connectors use approved endpoints, bounded responses, no redirect follow, appropriate access checks and throttling. HTML scrapers fail closed for unknown or blocked layouts. Connectors provide a source *discovery* layer, not automatic verification or full diligence.

## Additive architecture and data integrity

The application preserves the existing Vinext/React/Next API stack, Cloudflare D1, Drizzle, authentication and user research. Migration `drizzle/0001_source_refresh.sql` creates two tables:

- `source_candidates`: deduplicated pending source observations with publisher, URL, title, original observation and check dates, source excerpt, company match, original event date, review status, and structured metadata.
- `refresh_leases`: best-effort per-connector concurrency protection.

`core/source-adapters.mjs` parses external data and refuses ambiguous or unsupported relationships. `core/source-candidates.mjs` turns reviewed sources into persisted Source/Claim/Evidence/Affiliation/Signal records and can create an approved iVenture or EnterpriseWorks new venture. `core/refresh-runner.mjs` records job status, counts and errors. The new admin APIs `/api/admin/refresh` and `/api/admin/candidates` support authorized refresh and explicit approve/reject/create actions with audit records. Review can be performed from Settings.

**Public claims are never made by news discovery alone.** Changes to external descriptions or financing are not fabricated; missing amounts remain unknown. The source-publication date is not substituted with retrieval date. Unknown or contradictory relationships are not silently collapsed into a generic university-backed classification.

## Scheduler and production requirements

A new opt-in workflow `.github/workflows/refresh-public-sources.yml` calls the deployed, admin-authenticated refresh endpoint. The default cadence is daily university/Research Park news and, on Mondays, EnterpriseWorks, iVenture, Research Park directories, OTM, and identity-gated federal sources. The workflow requires repository variable `IVR_AUTOMATION_ENABLED=true` and `IVR_SITE_URL`, a matching `IVR_ADMIN_TOKEN` secret, and optionally `IVR_SITES_SERVICE_TOKEN` when private Sites service authentication is necessary. It does not start automatically after merging GitHub code. The private ChatGPT Sites deployment and its D1 database remain unchanged in this PR.

**Required before deployment:** Back up D1; run the additive migration; deploy the compatible version; test each connector manually, inspect stored candidates and jobs; verify the CI status; configure a supported service identity for a private deployment; enable scheduling last.

## Known limitations and review boundaries

- EnterpriseWorks is an official directory category and may list companies not tagged `Startup`; the program is not a guarantee that a company is currently active or venture-investable. The connector checks up to six numbered category pages, stops at later-page 404s, and retains the exact listing page as a source.
- Only source-verified and manually approved EnterpriseWorks/iVenture additions enter the research universe; absence of a linked iVenture venture website prevents automatic creation.
- iVenture and EnterpriseWorks memberships are not direct evidence of student-founder identity. Student founder status, alumni status, licensed IP, and equity ownership require their own sourced claims; coverage of founders beyond program directories remains incomplete.
- Exact-name matching can miss renamed ventures and synonyms. Ambiguous identity requires human review, never a guessed company merge.
- HTML templates, robots rules and upstream API schemas may change. Source adaptation and quotas are bounded; no automatic bypass or scraping of blocked content.
- History rows preserve changed observations; a newly discovered article does not establish a financing event, company revenue, or investment quality. Funding amounts should not be interpreted as venture equity investment.
- Unit tests and CI cover representative fixtures; private production credentials, signed-in browser interactions and live-site deployment are not verified by this GitHub branch.

## Validation

GitHub Actions runs `node --test tests/*.test.mjs`, type checking, lint, and a production build on this branch. See the branch's latest run for current results. Deterministic fixtures cover source matching, iVenture/EnterpriseWorks memberships, review-only discovery, explicit new-company creation, deduplication, missing federal award amounts, and safe refresh job logging. The initial 29 reviewed source-linked companies are unchanged.
