/** PostgreSQL CI-only Supabase Auth stub. Never run against production. */
import postgres from 'postgres';
const url=process.env.DATABASE_URL;
if(!url||!(/localhost|127\.0\.0\.1/.test(url)))
 throw Error('CI auth stub requires localhost PostgreSQL');
const sql=postgres(url,{max:1,prepare:false,ssl:false});
try{
 await sql.unsafe(`
 DO $roles$
 BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 END;
 $roles$;
 CREATE SCHEMA IF NOT EXISTS auth;
 CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
 CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
 SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid;
 $fn$;
 GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
 GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
 `);
 console.log('Local postgres test roles and auth stub ready');
}finally{await sql.end();}
