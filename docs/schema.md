# Data model

| Table | Role | Integrity |
|---|---|---|
| companies | Canonical directory identity, profile URL, first observed and last refreshed | Profile URL unique; primary key source slug |
| sources | Original URL, title, publisher, type, publication/retrieval/check dates, hash, accessibility | URL unique |
| claims | Company predicate/value, classification, publication state, dates | Unique company/field/value; company foreign key |
| evidence | Supporting source excerpt or structured field, relationship, extraction method, verified date | Unique claim/source; two foreign keys |
| affiliations | University, documented relationship, dates and claim | Company and claim foreign keys |
| source_history | Source observation versions | Unique source/hash |
| signals | Dated events distinct from first observation | Unique dedup key; company/claim foreign keys |
| ingestion_jobs | Connector, status, start/end, count, error | Running and failure records retained |
| review_queue | Candidate review reason/status | Optional claim foreign key; reserved for expanded review workflow |
| audit | Actor, operation, target, timestamp | Append-only through administration actions |
| workspace | User-owned notes, watchlists, statuses, saved searches, theses and editable reports | Unique user/kind/key; all API reads/writes scoped to trusted user ID |

Public claims require an evidence join. A published claim and its evidence are imported atomically. Rejected claims remain in storage but are excluded from public queries. Conflicting values are retained; the display flags conflicts. Applicable dates are nullable and are not inferred from retrieval time. Ingestion never creates funding or product-launch events from directory records.
