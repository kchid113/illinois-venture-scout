# Patch 1 — transparent metrics and methodology

Implemented methodology version 1.1.0 as a patch to the existing application. No database migration, authentication change, company replacement, or production re-ingestion is required.

## Files changed

- `core/methodology.mjs`: centralized, versioned metric registry and shared summary, sector and signal eligibility rules.
- `core/records.mjs`: traceable screening, explicit missingness, conflict exclusion and immutable evidence snapshots.
- `components/metric-info.tsx`: accessible Radix information popovers and expanded methodology page.
- `components/radar.tsx`: contextual explanations, classifications, source details and screening breakdowns throughout the UI.
- `app/globals.css`: compact responsive popovers, registry and evidence styling.
- `lib/radar.ts`, `app/api/data/route.ts`: shared calculations and evidence-backed activity responses.
- `tests/core.test.mjs`, `tests/methodology.test.mjs`: updated eligibility fixtures and regression tests.
- `README.md`, this report: methodology and validation documentation.

## Coverage and audited rules

Dashboard counts, recent additions, verified developments, source counts, sector chart, discovery filters/order/cards/tables, company profiles, comparisons, research workflow labels, thesis criteria/weights/results, source freshness and verification labels now have contextual explanations. Company-specific explanations reuse existing claim/evidence/source records and expose publisher, URL, excerpts, dates, classification and relationship; source panels include related conflicting values.

The registry distinguishes source-reported directory sectors from system-derived relationships and analyst preferences. EnterpriseWorks requires its explicit directory category. Tenant status does not establish a spinout or university ownership. Sector charts group the stored combined category strings. Recent additions are database records created within the previous 30 days, excluding future timestamps. Supported claims are counts, not completeness percentages. Verified developments require a verified signal, published claim and supporting evidence.

Screening uses case-insensitive substring matching against eligible published, evidenced factual/company-reported claims. Empty criteria, missing evidence and conflicting factors remain unknown; disabled factors have zero weight. Fit is matched weight / known weight × 100, rounded to an integer; coverage is known weight / total enabled weight × 100, displayed down to two decimals. Scores are withheld below an unrounded 50% coverage threshold. The threshold is a product safeguard, not an empirically validated investment model. Each criterion displays its exact weight, evidence, match and contribution. Snapshots preserve criteria, evidence, result and method version; historical preference-only theses cannot reconstruct historical scores.

## Validation

- 25 unit tests passed, including original ingestion, provenance, exports, isolation and connector tests; new tests cover registry completeness, score reconciliation, missing/conflicting evidence, empty criteria, invalid/zero weights, threshold precision, immutable snapshots and actual SQLite metric queries.
- TypeScript checking and ESLint passed.
- Production build passed; final publication packaging rebuilds the exact source state.
- Managed browser checks passed: click/Enter/Escape information controls; correct sector claim and source details; discovery search; two-company comparison with explicit unknowns; expanded 35/25-weight contributions totaling 100%; saved evidence snapshot; device-local note persistence after reload.
- Browser coverage is interactive smoke testing, not an unattended UI suite. Signed-in production note writes and exhaustive mobile viewport testing were not performed.

## Remaining limitations

Stage, lifecycle, business model, funding, grants and commercial traction cannot be substantiated from the current imported dataset and remain unverified/unavailable. No completeness denominator, validated investment ranking, numeric source confidence, growth or momentum score is invented. Directory classifications may be debatable but are identified as directory taxonomy with their actual source. The research screen still evaluates the first page alphabetically, explicitly disclosed rather than described as a ranked universe. Refresh remains manual. Corrections can be documented in private notes but are not automatically sent to an administrator.

The methodology page states that Illinois Venture Radar is independent and is not affiliated with or endorsed by the University of Illinois.


## Follow-up implementation audit — v1.2.0 (feature/methodology-tooltips)

The repository already contained the original v1.1.0 patch before this branch was created. This follow-up preserves that work and makes these targeted improvements:

- **Evidence semantics:** public search and filters, claim/sector counts, company claim queries and screening now require at least one actual `supports` evidence relationship; a contradicting-only citation does not substantiate a claim. Contradictory source records remain preserved for review.
- **Company profile:** lifecycle, founder/leadership, typed equity financing, grants/contracts and commercial traction now render their exact supported claim(s), classification and citation if present. Unpopulated fields continue to say `Not verified`, not zero. Generic untyped `funding` cannot be arbitrarily labelled equity or grant. The diligence gaps sidebar reflects the same source-backed fields.
- **Source display:** citation buttons prefer supporting evidence while the drawer still exposes contradictions. A company profile distinguishes its record update time from the latest linked source-check timestamp.
- **Methodology registry:** clarified that affiliation mappings and verification classifications are system-derived annotations from sourced records, added precise founder/traction entries, a typed profile-field mapping, and versioned the rule changes as 1.2.0. The Methodology link is now in the main navigation.
- **Regression tests and CI:** added contradictory-only evidence and profile field tests; provided GitHub Actions jobs for SQLite/unit tests, typecheck, lint and production build.

The prior 25-test, typecheck, build and managed-browser validation cited above pertains to **v1.1.0** before these follow-up edits. GitHub Actions results, rather than the prior report, determine whether **v1.2.0** tests and build pass. Browser interaction tests were not re-run in this chat's tooling. No data source has been re-fetched, no hosted database has been modified, and this branch has not been deployed. Source freshness is still manual; missing stage, company equity funding, external traction and founder evidence in the existing initial dataset cannot be substantiated automatically.
