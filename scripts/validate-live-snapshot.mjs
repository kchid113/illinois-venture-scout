/**
 * Exercise the exact generated SQL against SQLite using the repository's
 * migrations and seed. This cannot approve or deploy any data.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const manifest=JSON.parse(read('data/live-source-catalog.json'));
assert.equal(manifest.schemaVersion,1);
assert.ok(Array.isArray(manifest.companies));
assert.equal(manifest.companies.length,manifest.uniqueNormalizedNames);
assert.equal(new Set(manifest.companies.map(c=>c.normalizedName)).size,manifest.companies.length);
assert.equal(manifest.seedCompanyCount,29);
assert.equal(manifest.sourceChecks.length,13,'5 Research Park + 6 EnterpriseWorks + iVenture + OTM');
assert.equal(manifest.completeness,manifest.sourceChecks.every(x=>x.status==='collected'));
assert.ok(manifest.sourceChecks.every(x=>['collected','failed'].includes(x.status)));
for(const company of manifest.companies){
 assert.ok(company.name&&company.normalizedName);
 assert.ok(company.sourceObservations.length>0);
 for(const observation of company.sourceObservations){
  assert.equal(new URL(observation.sourceUrl).protocol,'https:');
 }
}
const db=new DatabaseSync(':memory:');
try{
 db.exec('PRAGMA foreign_keys=ON');
 for(const file of ['drizzle/0000_first_drax.sql','drizzle/0001_source_refresh.sql'])db.exec(read(file));
 db.exec(read('data/seed.sql'));
 const start=db.prepare('SELECT count(*) n FROM companies').get().n;
 const baseClaims=db.prepare('SELECT count(*) n FROM claims').get().n;
 db.exec(read('data/live-source-research-park-import.sql'));
 db.exec(read('data/live-source-candidates.sql'));
 const companies=db.prepare('SELECT count(*) n FROM companies').get().n;
 const claims=db.prepare('SELECT count(*) n FROM claims').get().n;
 const candidates=db.prepare('SELECT count(*) n FROM source_candidates').get().n;
 const expectedAdds=manifest.collection.additionalResearchParkImportable;
 assert.equal(companies,start+expectedAdds,'only reviewed directory additions become public');
 assert.ok(claims>=baseClaims,'directory evidence is additive');
 assert.equal(candidates,manifest.collection.distinctCandidates);
 assert.equal(db.prepare("SELECT count(*) n FROM source_candidates WHERE status<>'Pending'").get().n,0);
 assert.equal(db.prepare("SELECT count(*) n FROM claims WHERE field='funding'").get().n,0);
 // Re-importing the same snapshot cannot create additional companies or leads.
 db.exec(read('data/live-source-research-park-import.sql'));
 db.exec(read('data/live-source-candidates.sql'));
 assert.equal(db.prepare('SELECT count(*) n FROM companies').get().n,companies);
 assert.equal(db.prepare('SELECT count(*) n FROM source_candidates').get().n,candidates);
 console.log(JSON.stringify({validated:true,additionalCompanies:expectedAdds,pendingCandidates:candidates,observations:manifest.sourceObservations,failedSources:manifest.collection.failures}));
}finally{db.close();}
