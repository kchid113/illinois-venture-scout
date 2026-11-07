import {readFile} from 'node:fs/promises';
import {database,all,closeDatabase} from '../db/postgres.mjs';
import {recordStatements} from '../core/records.mjs';
import {assertProductionSeeds} from '../core/production-integrity.mjs';

const load=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const seed=JSON.parse(await load('data/import.json'));
const profiles=JSON.parse(await load('data/profile-evidence.json'));
assertProductionSeeds(seed,profiles);
const db=database();
try{
 // Existing profiles and evidence are always conserved by idempotent upserts.
 for(const record of [...seed,...profiles]){
  const ops=await recordStatements(record);
  await db.batch(ops.map(o=>db.prepare(o.sql).bind(...o.values)));
 }
 const snapshot=await load('data/catalog-additions.pg.sql');
 const statements=snapshot.split(/\r?\n/).map(line=>line.trim())
  .filter(line=>line&&!line.startsWith('--'));
 if(statements.length!==434||statements.some(line=>!line.endsWith(';')||
  !/^(INSERT INTO|UPDATE claims SET status='Conflicting')/.test(line)))
  throw Error('Unexpected PostgreSQL source catalog: manual inspection required');
 // Source catalog is committed reviewable SQL, never an arbitrary network payload.
 await db.batch(statements.map(s=>db.prepare(s.slice(0,-1))));
 const counts=(await all("SELECT (SELECT count(*) FROM companies) AS companies,(SELECT count(*) FROM source_candidates) AS candidates,(SELECT count(*) FROM source_candidates WHERE status='Pending') AS pending"))[0];
 if(Number(counts.companies)<43||Number(counts.candidates)<243)
  throw Error('Post-import company/candidate count below validated snapshot');
 console.log('Import verified:',JSON.stringify(counts));
 console.log('Candidates remain Pending until an authenticated administrator approves them.');
}finally{await closeDatabase();}
