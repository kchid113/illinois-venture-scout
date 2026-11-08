import {readFile,readdir} from 'node:fs/promises';
import postgres from 'postgres';

const url=process.env.DATABASE_URL;
if(!url)throw Error('DATABASE_URL required');
const sql=postgres(url,{max:1,prepare:false,ssl:/localhost|127\.0\.0\.1/.test(url)?false:'require'});
try{
 // Ledger is protected even when the initial schema predated this runner.
 await sql.unsafe(`CREATE TABLE IF NOT EXISTS ivr_schema_migrations(
  version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now()
 ); REVOKE ALL ON ivr_schema_migrations FROM PUBLIC,anon,authenticated;
 ALTER TABLE ivr_schema_migrations ENABLE ROW LEVEL SECURITY;`);
 const dir=new URL('../supabase/migrations/',import.meta.url);
 const versions=(await readdir(dir)).filter(p=>/^\d{14}_[a-z0-9_-]+\.sql$/.test(p)).sort();
 if(!versions.length)throw Error('No versioned PostgreSQL migration scripts found');
 for(const version of versions){
  const prior=await sql.unsafe('SELECT version FROM ivr_schema_migrations WHERE version=$1',[version]);
  if(prior.length){console.log('Migration already applied',version);continue;}
  const migration=await readFile(new URL(version,dir),'utf8');
  if(!/^\s*--[^\n]*\n[\s\S]*\bBEGIN;[\s\S]*\bCOMMIT;\s*$/i.test(migration))
   throw Error('Migration must wrap changes in an explicit transaction: '+version);
  // All SQL is fixed, reviewed repository text, never user-supplied.
  await sql.unsafe(migration);
  await sql.unsafe('INSERT INTO ivr_schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING',[version]);
  console.log('Applied Postgres migration',version);
 }
}finally{await sql.end();}
