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
