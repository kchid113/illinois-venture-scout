# Patch 2 — Regression test audit and repair report

**Scope:** Pull request #2, `feature/live-source-refresh`, tested against the existing D1/Drizzle application and the new official-source connectors. This is a test-and-repair patch, not a rebuild. It does not merge, deploy, migrate, or refresh production data.

## Test execution

GitHub Actions `.github/workflows/verify-methodology.yml` runs the Node 22 built-in test runner with V8 source coverage, TypeScript typecheck, ESLint, and a production build. The final outcome and exact number of passed test cases must be taken from the latest PR-head run, not from a historical workflow attempt. All test input for upstream services is fixture-based and deterministic; no live API calls or customer credentials are required.

### Case inventory

| Area | Tests and adversarial conditions |
| --- | --- |
| Existing functionality | Production dataset authenticity, 29-company reviewed seed, data provenance, search/screening rules, evidence, watchlist data isolation, CSV/report creation and explanation methodology |
| Official listing and news parsing | Wrong article hosts, credentialed URLs, redirects, query/fragment spoofing, article title ambiguity, partial names, nav/footer mentions, missing source titles, layout changes, duplicate entries, embedded HTML, missing and impossible dates |
| University ecosystem programs | Distinguish Research Park tenants, EnterpriseWorks Incubator listings (including pages without the Startup category), iVenture cohorts, OTM startups and university-IP affiliation; negative assertions for university ownership, financing and traction |
| New company matching | Exact normalized name match; duplicate name ambiguity; slug/profile mismatch; external domains and private addresses; missing program-linked official company profile; explicit admin create-only pathways |
| Federal data | Previously sourced NIH organization and USAspending UEI only; reject wrong recipients, malformed/null API rows, invalid identifiers, negative/non-finite/unknown award values, incorrect dates and unexpected API payloads |
| Candidate integrity | Provenance host/path allowlists; bounded title, publisher, excerpt, payload, company identity and external ID; strict observation and event dates; stable hashed identity and source version updates; no direct public publication |
| Review transaction | Approve/reject/create, wrong company ID/name, malformed IDs, stale candidates, exactly one terminal decision, competing decisions, company foreign keys, atomic rollback after a source write error, audit trail and deduplication |
| Refresh operations | Per-source leases and expired lease recovery, partial or failed jobs, 403 and robots restrictions, missing verified identity mappings, refresh replays, source pagination, changed names or duplicate identities placed in review rather than automatically imported |
| Automation | Seven UTC day choices, 11 source selections, opt-in behavior, CLI-authentication errors, unsafe deployment URLs, protected bearer/Sites headers and failure propagation with a fake network transport |
| Database migrations | Additive D1 schema, Drizzle snapshot/journal consistency, foreign keys, indexes, single-use status trigger, initial seed preservation and existing research workspace compatibility |
| Static and build | TypeScript compile, ESLint, production build and server-route dependency integrity through the existing CI pipeline |

## Issues found and fixes

1. **Source overmatching:** OTM's original whole-page text search could treat navigation or footers as evidence of university IP; changed to require a bounded startup listing entry with an exact company identity.
2. **Invalid or altered citations:** Shared `core/source-security.mjs` now checks source-specific canonical URLs, rejects credentials/query-string truncation, private venture websites, wrong hostnames and unsupported paths.
3. **Unreliable event dates and amounts:** Source dates are calendar-validated instead of relying on JavaScript's rollover of impossible dates. Invalid, missing or negative federal amounts stay unknown, not zero.
4. **Upstream parser crashes:** Defensive API record validation skips malformed/null rows; blocked or unexpected responses abort safely and preserve the import history.
5. **Unbounded candidate metadata:** `candidateStatements` bounds source metadata and payload sizes and validates event/observation timestamps.
6. **Double review decisions:** A SQL migration trigger enforces single-use `Pending → Approved/Rejected` transitions. `core/review-service.mjs` combines decision, company creation, evidence, affiliations and audit in one D1 batch, preserving atomicity and foreign-key ordering under concurrent reviews.
7. **Duplicate or changed company identities:** The directory runner checks existing names, slugs and profiles; ambiguous relationships go to a review queue instead of silently creating or overwriting a company. The directory collector is an injectable dependency for deterministic integration testing.
8. **Legacy administration bypass:** Existing administrator directory refresh now calls the same guarded runner as Patch 2. GitHub release identity lookup requires explicit supporting evidence.
9. **Unvalidated automation:** Source selection and clean HTTPS deployment-target rules live in `core/refresh-schedule.mjs`; the CLI has mocked HTTP end-to-end tests without making live requests.
10. **Source-review UI URL policy:** Candidate review links use the same trusted website/profile rules as approved venture creation.

## Coverage and limitations

Node V8 coverage measures the tested JavaScript modules (including the test files) and does **not** establish full Next.js/React UI coverage. The `app/api` and `components` files are checked by TypeScript/lint/build, but browser-level clicks, keyboard and screen-reader use, real authentication, D1 production migrations, external provider layout/API compatibility and a live deployment remain **manual pre-merge/pre-deployment checks**. CI cannot prove that the upstream OTM or iVenture site is currently accessible, accepts automation, or exposes records in the fixture shape.

The application keeps the new GitHub Actions refresh schedule **disabled by default** until official source access, database migration, deployment permissions and service credentials are explicitly configured. Incomplete coverage should never be represented as source verification or evidence of a company receiving university backing.

## Manual release checklist

1. Backup and apply `drizzle/0001_source_refresh.sql` to a development D1 database, then verify all existing records and user-owned notes remain intact.
2. Deploy a staging build with trusted administrator credentials, confirm protected route requests reject missing/invalid auth and cross-origin writes, and validate the review inbox on mobile/desktop and keyboard.
3. Check official source layouts, robots policy, API response contracts and at least one genuine source candidate per configured connector before enabling schedules. A connector returning no results should not be supplemented with guessed records.
4. Run a staged approve/reject/create flow against real source records, verify original citations, publication/check dates and source classification, and confirm no fabricated financing or ownership conclusions.
5. Verify historical reports and research watchlists remain accessible, then explicitly enable scheduled tasks only if the private site's service-to-service access is supported.
