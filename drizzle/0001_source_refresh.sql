-- Patch 2: review-only external discoveries and idempotent refresh leases.
-- This migration is additive and does not alter the initial company/claim dataset.
CREATE TABLE IF NOT EXISTS source_candidates (
 id text PRIMARY KEY NOT NULL,
 connector text NOT NULL,
 external_id text NOT NULL,
 source_url text NOT NULL,
 publisher text NOT NULL,
 title text NOT NULL,
 excerpt text NOT NULL,
 company_name text,
 company_id text REFERENCES companies(id),
 event_date text,
 observed_at text NOT NULL,
 last_checked text NOT NULL,
 status text NOT NULL DEFAULT 'Pending',
 content_hash text NOT NULL,
 payload text NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS candidate_status_idx ON source_candidates(status,last_checked);
CREATE INDEX IF NOT EXISTS candidate_company_idx ON source_candidates(company_id);
CREATE INDEX IF NOT EXISTS candidate_connector_idx ON source_candidates(connector);
CREATE TABLE IF NOT EXISTS refresh_leases (
 name text PRIMARY KEY NOT NULL,
 token text NOT NULL,
 expires_at text NOT NULL
);
