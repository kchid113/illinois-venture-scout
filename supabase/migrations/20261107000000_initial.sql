-- Authoritative PostgreSQL schema for Illinois Venture Radar.
-- All company facts remain source-backed; investor research is private by default.
BEGIN;
CREATE TABLE IF NOT EXISTS companies (
 id text PRIMARY KEY, name text NOT NULL, aliases text NOT NULL DEFAULT '[]',
 profile text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'Not verified',
 first_observed text NOT NULL, updated_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS company_name_idx ON companies(name);
CREATE TABLE IF NOT EXISTS sources (
 id text PRIMARY KEY, url text NOT NULL UNIQUE, title text NOT NULL,
 publisher text NOT NULL, type text NOT NULL, published_at text,
 retrieved_at text NOT NULL, last_checked text NOT NULL, hash text NOT NULL,
 accessibility text NOT NULL DEFAULT 'Accessible'
);
CREATE TABLE IF NOT EXISTS claims (
 id text PRIMARY KEY, company_id text NOT NULL REFERENCES companies(id),
 field text NOT NULL,value text NOT NULL,classification text NOT NULL,
 status text NOT NULL,first_observed text NOT NULL,verified_at text NOT NULL,
 valid_from text,valid_to text
);
CREATE INDEX IF NOT EXISTS claim_company_idx ON claims(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS claim_value_idx ON claims(company_id,field,value);
CREATE TABLE IF NOT EXISTS evidence (
 id text PRIMARY KEY,claim_id text NOT NULL REFERENCES claims(id),
 source_id text NOT NULL REFERENCES sources(id),
 excerpt text NOT NULL,relationship text NOT NULL DEFAULT 'supports',
 method text NOT NULL,verified_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS evidence_pair_idx ON evidence(claim_id,source_id);
CREATE TABLE IF NOT EXISTS affiliations (
 id text PRIMARY KEY,company_id text NOT NULL REFERENCES companies(id),
 claim_id text NOT NULL REFERENCES claims(id),university text NOT NULL,
 type text NOT NULL,status text NOT NULL,valid_from text,valid_to text
);
CREATE TABLE IF NOT EXISTS signals (
 id text PRIMARY KEY,company_id text NOT NULL REFERENCES companies(id),
 claim_id text NOT NULL REFERENCES claims(id),category text NOT NULL,
 description text NOT NULL,event_date text,first_observed text NOT NULL,
 dedup_key text NOT NULL UNIQUE,status text NOT NULL
);
CREATE TABLE IF NOT EXISTS source_history (
 id text PRIMARY KEY,source_id text NOT NULL REFERENCES sources(id),
 hash text NOT NULL,observed_at text NOT NULL,summary text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS source_version_idx ON source_history(source_id,hash);
CREATE TABLE IF NOT EXISTS ingestion_jobs (
 id text PRIMARY KEY,connector text NOT NULL,status text NOT NULL,
 started_at text NOT NULL,finished_at text,count integer NOT NULL DEFAULT 0,
 message text
);
CREATE TABLE IF NOT EXISTS review_queue (
 id text PRIMARY KEY,claim_id text REFERENCES claims(id),
 reason text NOT NULL,status text NOT NULL DEFAULT 'Pending',
 created_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
 id text PRIMARY KEY,actor text NOT NULL,action text NOT NULL,
 target text NOT NULL,created_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS source_candidates (
 id text PRIMARY KEY,connector text NOT NULL,external_id text NOT NULL,
 source_url text NOT NULL,publisher text NOT NULL,title text NOT NULL,
 excerpt text NOT NULL,company_name text,company_id text REFERENCES companies(id),
 event_date text,observed_at text NOT NULL,last_checked text NOT NULL,
 status text NOT NULL DEFAULT 'Pending',
 content_hash text NOT NULL,payload text NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS candidate_status_idx ON source_candidates(status,last_checked);
CREATE INDEX IF NOT EXISTS candidate_company_idx ON source_candidates(company_id);
CREATE INDEX IF NOT EXISTS candidate_connector_idx ON source_candidates(connector);
CREATE TABLE IF NOT EXISTS refresh_leases (
 name text PRIMARY KEY,token text NOT NULL,expires_at text NOT NULL
);
-- This trigger prevents duplicate or retroactive decisions under concurrency.
CREATE OR REPLACE FUNCTION enforce_one_time_candidate_review()
RETURNS trigger LANGUAGE plpgsql AS $review$
BEGIN
 IF OLD.status <> 'Pending' OR NEW.status NOT IN ('Approved','Rejected') THEN
  RAISE EXCEPTION 'Candidate review requires pending status and a terminal decision';
 END IF;
 RETURN NEW;
END;
$review$;
DROP TRIGGER IF EXISTS source_candidate_decision_once ON source_candidates;
CREATE TRIGGER source_candidate_decision_once BEFORE UPDATE OF status
 ON source_candidates FOR EACH ROW EXECUTE FUNCTION enforce_one_time_candidate_review();

-- Supabase-managed identities: no private workspace data is publicly readable.
CREATE TABLE IF NOT EXISTS workspace (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('watchlist','note','status','search','thesis','report','contact')),
 key text NOT NULL,value text NOT NULL,updated_at text NOT NULL,
 UNIQUE (user_id,kind,key)
);
CREATE INDEX IF NOT EXISTS workspace_user_idx ON workspace(user_id);
CREATE TABLE IF NOT EXISTS investor_roles (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('investor','admin')) DEFAULT 'investor'
);

-- All application data is served through authenticated Next.js handlers.
-- Never allow an external Supabase Data API client to write shared source data.
REVOKE ALL ON TABLE companies,sources,claims,evidence,affiliations,signals,
 source_history,ingestion_jobs,review_queue,audit,source_candidates,
 refresh_leases,investor_roles FROM PUBLIC,anon,authenticated;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE investor_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE workspace ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workspace FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON workspace TO authenticated;
DROP POLICY IF EXISTS investor_workspace_select ON workspace;
DROP POLICY IF EXISTS investor_workspace_insert ON workspace;
DROP POLICY IF EXISTS investor_workspace_update ON workspace;
DROP POLICY IF EXISTS investor_workspace_delete ON workspace;
CREATE POLICY investor_workspace_select ON workspace FOR SELECT TO authenticated
 USING (user_id = (SELECT auth.uid()));
CREATE POLICY investor_workspace_insert ON workspace FOR INSERT TO authenticated
 WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY investor_workspace_update ON workspace FOR UPDATE TO authenticated
 USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY investor_workspace_delete ON workspace FOR DELETE TO authenticated
 USING (user_id = (SELECT auth.uid()));
COMMIT;
