# Actual live-source catalog observations and reviewed-stage import

This report describes real upstream data collection from GitHub Actions. It
supersedes the original 29-record test-fixture-only status. The updated
collector is `scripts/collect-live-sources.mjs` and its workflow is
`.github/workflows/collect-live-sources.yml`.

## Outputs

- `data/live-source-catalog.json`: machine-readable observed source inventory,
  separate original names, normalized-name overlap groups, exact original seed
  links, raw source page URLs, timestamped successful/failed fetches, source
  identity conflicts and incomplete-source status.
- `data/live-source-research-park-import.sql`: additive, idempotent
  source-backed records for startups genuinely absent from the original 29
  Research Park companies. Generated using the same `recordStatements`
  evidence/claim rules as normal ingestion.
- `data/live-source-candidates.sql`: `Pending` source leads from the
  EnterpriseWorks and iVenture directories and from reviewed-manual OTM listings.
  These **do not publish a company, claim, financing figure or affiliation**;
  a signed-in administrator must investigate and decide each candidate.
- `data/otm-manually-observed-2026-11-04.json`: 45 public OTM directory names,
  industries and on-page external venture links transcribed from the official
  page on November 4, 2026. These are a **manual observation only**; website
  identity and current status are not independently verified.

Use the latest `data/live-source-catalog.json` for exact counts and the
per-source status; partial data is not silently labeled complete.

## Source-by-source validity

| Source | How collection works | Publication boundary |
| --- | --- | --- |
| Research Park pages 1–5 | Live GET of each numbered official startup category page, with robots and delay checks | Existing verified directory taxonomy, new canonical IDs only |
| EnterpriseWorks pages 1–6 | Live GET of official incubator category pages with canonical profile checks | Pending candidates and explicit human approval/creation |
| iVenture cohorts | Live GET plus parser for actual Sitefinity accordion panels and strong paragraph names | Pending candidates, separate Post-iVenture names excluded |
| OTM university-IP startup page | **Automated GET prohibited by provider robots policy**. Date-stamped manual review of the public official listing, with 45 observed names | Pending only; no programmatic bypass, no inference of licensing/equity |
| Research Park / Illinois news | Existing exact-match source enrichment, not a comprehensive company list | Pending and reviewed evidence |
| NIH RePORTER / USAspending | Existing exact reviewed organization/UEI match enrichment | Pending and reviewed award evidence, never free-form name matching |
| GitHub releases | Existing verified repository match enrichment | Sourced release events only |

The OTM page describes more than 60 active IP startups; the publicly rendered
page visible during manual review listed 45 named rows. Do not fabricate the
remaining companies or treat the discrepancy as resolved.

The combined listing may contain students' experiments, nonprofits,
incubator service providers, older program alumni and multiple directory
records for one venture. A normalized-name group is not a confirmed legal
entity merge. The manifest preserves distinct source links and marks unmatched
names for review.

## Reproduction

Run the GitHub Actions workflow **Capture live UIUC startup catalogs
(review only)** on the feature branch or push a change to the collector
source/validation/workflow. Its GitHub-hosted Node 22 worker:

1. Reads the 29 reviewed original records.
2. Observes all configured official startup directory pages independently.
   An upstream error never silently discards observations from other pages.
3. Reconciles the observed names and canonical Research Park slugs against the
   seed without fuzzy merges or unsupported financing.
4. Converts source observations into tracked SQL for additive new Research Park
   records and `Pending` candidates for additional sources.
5. Runs `scripts/validate-live-snapshot.mjs` against actual project D1 SQLite
   migrations and seed. It verifies that only Research Park additions publish
   directly; all other startup mentions stay pending, and repeat import is
   idempotent.
6. Uploads the JSON and SQL as a downloadable GitHub Actions artifact and
   commits the files to the *feature branch only*. No Cloudflare secrets or
   production database are used.

The workflow failure/partial status is recorded in
`sourceChecks`/`collection` in the JSON. The presence of a generated
artifact is never proof of an exhaustive ecosystem census.

## After PR review, deployment and migration

1. Review source counts, all source links and identity conflicts. Merge the
   branch only after its CI passes and the reported gaps are acceptable.
2. Deploy from GitHub Actions to the independent Cloudflare Worker and run
   the tracked migrations as described in the Cloudflare deployment runbook.
3. In a maintenance change reviewed by the administrator, apply the additive
   Research Park SQL first, then the pending candidate SQL, with Wrangler
   against the **dedicated** D1 database. Use an explicit database backup
   before production import; never overwrite the existing 29-record seed or
   private workspace tables.
4. Review unmatched `source_candidates` through the signed-in Settings
   review queue before approving new companies. Never bulk-approve by name,
   grant money or inferred campus membership.
5. News and funding source adapters can then enrich verified companies using
   their established rules. Automated scheduled refresh must still obtain
   machine authentication compatible with Cloudflare Access.

No source snapshot alone deploys the site or imports the production D1 database.
