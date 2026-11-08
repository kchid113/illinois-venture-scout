-- Bound enrichment API work per invocation and resume after verified identity.
-- Separate from leases: a lease is transient; a cursor survives invocations.
BEGIN;
CREATE TABLE IF NOT EXISTS refresh_cursors (
 name text PRIMARY KEY,
 last_claim_id text NOT NULL DEFAULT '',
 updated_at text NOT NULL
);
REVOKE ALL ON TABLE refresh_cursors FROM PUBLIC, anon, authenticated;
ALTER TABLE refresh_cursors ENABLE ROW LEVEL SECURITY;
COMMIT;
