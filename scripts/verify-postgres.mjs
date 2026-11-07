import {all,closeDatabase} from '../db/postgres.mjs';
try{
 const [counts]=await all(`SELECT
 (SELECT count(*) FROM companies) companies,
 (SELECT count(*) FROM claims WHERE status IN ('Published','Conflicting')) claims,
 (SELECT count(*) FROM source_candidates) candidates,
 (SELECT count(*) FROM source_candidates WHERE status='Pending') pending,
 (SELECT count(*) FROM claims c WHERE c.status IN ('Published','Conflicting')
   AND NOT EXISTS(SELECT 1 FROM evidence e WHERE e.claim_id=c.id AND e.relationship='supports')) unsupported,
 (SELECT count(*) FROM evidence e WHERE NOT EXISTS(SELECT 1 FROM sources s WHERE s.id=e.source_id)) broken_sources
 `);
 if(Number(counts.companies)<43||Number(counts.candidates)<243||
  Number(counts.unsupported)!==0||Number(counts.broken_sources)!==0)
  throw Error('Source-backed startup integrity validation failed: '+JSON.stringify(counts));
 console.log('Verified PostgreSQL data integrity',JSON.stringify(counts));
}finally{await closeDatabase();}
