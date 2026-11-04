# Full UIUC startup-source coverage patch

Branch: `feature/full-uiuc-source-coverage`

## Intent and boundaries

The 29-company reviewed Research Park seed is real, **not** fake or demo data.
It is an incomplete starting sample. This patch expands the **operational
discovery path**, not the checked-in historical seed or private hosted database.
No fetch, migration, production data change or Cloudflare deploy occurs merely
by merging this branch.

The goal is comprehensive **candidate discovery from the configured official
startup catalogs**, without conflating a university program relationship with
university ownership, financing received, active licensing or investment merit.

## What is included

| Source | Coverage after patch | Publication rule |
| --- | --- | --- |
| Research Park startup directory | All five currently advertised category pages, each with a source URL and identity checks | Existing direct, source-backed directory import; conflicts enter review queue |
| EnterpriseWorks incubator directory | Up to six official category pages, including entries not tagged Startup | Stage exact matches and unmatched entries; manual approval or explicit creation with canonical official profile |
| iVenture Startups by Cohort | All named cohort entries recognized by the supported layout, including nonprofit teams | Stage; unmatched creation requires a source-linked venture website and human review |
| UIUC OTM startup directory | Explicit startup cards plus named, sector-grouped startup entries (not only names already in DB) | Stage; unmatched creation requires a source-linked public website and human review |
| Research Park and Illinois entrepreneurship news | Source-backed mentions of uniquely identified existing companies | Review-only enrichment; not a company catalog |
| NIH RePORTER / USAspending | Previously verified organization names / UEIs only | Review-only research/award enrichment, never name-guessed startup discovery |
| Verified GitHub releases | Existing source-backed repository identity claims only | Dated product event enrichment, not a startup directory |

A website link is a company-identity aid, **not proof** of venture funding,
market traction, license status, or equity. Unlinked iVenture and OTM candidates
remain pending until the identity can be independently resolved. Similar names
are not silently merged. The source's site or taxonomy can change, so a
successful request is not a guarantee of a complete census.

## How to backfill a deployed application

1. Deploy the tested branch through the reviewed PR to `main` and the existing
   manual Cloudflare workflow. Verify authentication and apply both existing
   D1 migrations; no new schema migration is required by this patch.
2. Sign into the deployed site as the email configured in `IVR_ADMIN_EMAIL`.
   Open **Settings → Discover from all 8 official startup catalogs**.
3. The browser calls the existing protected `POST /api/admin/refresh`
   sequentially for Research Park pages 1–5, EnterpriseWorks, iVenture and OTM.
   Requests obey each adapter's robots, fixed-origin, rate-limit and payload
   restrictions. An error from one connector is reported and does not pretend
   that catalog is complete.
4. Research Park additions with consistent canonical identities are imported
   into D1. New EnterpriseWorks, iVenture and OTM candidates are staged in
   `source_candidates`, **not** automatically included in Discover.
5. Open **Settings → Pending source review**. The queue now uses 50-item pages
   and reports a total, so discoveries beyond the former 100-item cutoff are
   accessible. Inspect the original source (and venture profile if available),
   then approve a known exact match, create a reviewed uniquely identified
   venture, or reject. Unmatched entries without an eligible source-linked
   identity cannot be created automatically.
6. Re-run discovery when source lists change. Repeated observations do not
   reset approved/rejected decisions. Previously unmatched pending candidates
   may acquire an exact company link on subsequent refreshes.

The GitHub Actions scheduled refresh is separate and disabled unless enabled
by its own credentials and variables. The standalone Cloudflare Worker requires
valid Access identity on requests. **Do not enable scheduled machine refresh**
until service authentication is deliberately implemented and validated.

## Measuring completeness

- Count **published companies** separately from **pending candidates** and
  **raw source observations**. These are not interchangeable.
- Compare the number of parsed rows for each catalog with its live source page.
  A source can contain duplicates across pages, alumni, historical teams,
  nonprofits or enterprises that are not suitable venture investments.
- The official OTM page currently describes more than 60 active startups;
  iVenture advertises more than 160 ventures including nonprofits. Neither
  statement establishes how many unique, verified companies are in the radar.
- OTM layout parsing supports recognized sector headings, structured startup
  cards and bold-name paragraph entries. If a site changes its HTML, review
  the resulting counts and fixtures. Do not invent entries to meet a number.
- This patch does not claim to have crawled live upstream pages in CI, created
  the entire catalog in a production D1 instance, or verified every company's
  current status. Independent staging verification remains required.

## Tests and safeguards

`tests/full-source-coverage.test.mjs` checks five-page Research Park coverage,
a 72-name OTM catalog, 132-item staging/review pagination, duplicate filtering,
audited creation, identity relinking and immutable review decisions. The
existing regression suite remains authoritative for authorization, evidence,
isolated research, export provenance, source robots policies and migrations.

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`.

## Explicit non-goals

No fabricated pre-populated seed; no automatic website-based identity merge;
no bulk approval of claims; no bootstrapping/funding inference; no bypass of
provider rate limits or robots policies; no new API keys; no modification to
ChatGPT Sites; no autonomous deployment.
