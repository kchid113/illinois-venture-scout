import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {stripSQLiteTransaction,buildD1CatalogFile} from '../scripts/prepare-d1-catalog-import.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('D1 catalog preparation removes SQLite transaction wrappers without changing data',()=>{
 const companies=read('data/live-source-research-park-import.sql');
 const candidates=read('data/live-source-candidates.sql');
 const manifest=JSON.parse(read('data/live-source-catalog.json'));
 const result=buildD1CatalogFile({companies,candidates,manifest});
 assert.ok(result.companyStatementCount>manifest.collection.additionalResearchParkImportable);
 assert.equal(result.candidateCount,243);
 assert.ok(!/^\s*(?:BEGIN TRANSACTION|COMMIT);/mi.test(result.sql));
 assert.ok(result.sql.includes('Hourglass Medical'));
 assert.ok(result.sql.includes('INSERT INTO source_candidates('));

 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON;');
  for(const f of ['drizzle/0000_first_drax.sql','drizzle/0001_source_refresh.sql'])
   db.exec(read(f));
  db.exec(read('data/seed.sql'));
  db.exec(result.sql);
  assert.equal(db.prepare('SELECT count(*) n FROM companies').get().n,43);
  assert.equal(db.prepare("SELECT count(*) n FROM source_candidates WHERE status='Pending'").get().n,243);
  assert.equal(db.prepare("SELECT count(*) n FROM claims WHERE field='funding'").get().n,0);
  db.exec(result.sql);
  assert.equal(db.prepare('SELECT count(*) n FROM companies').get().n,43);
  assert.equal(db.prepare('SELECT count(*) n FROM source_candidates').get().n,243);
 }finally{db.close();}
});

test('D1 import preparation rejects forged published claims and unexpected commands',()=>{
 const goodCompanies="BEGIN TRANSACTION;\nINSERT INTO companies(id) VALUES('abc');\nCOMMIT;\n";
 const goodCandidates="BEGIN TRANSACTION;\nINSERT INTO source_candidates(id) VALUES('c1');\nCOMMIT;\n";
 assert.equal(stripSQLiteTransaction(goodCompanies,{kind:'companies'}).statements,1);
 assert.equal(stripSQLiteTransaction(goodCandidates,{kind:'candidates'}).statements,1);
 for(const sql of [
  "BEGIN TRANSACTION;\nDELETE FROM companies;\nCOMMIT;",
  "BEGIN TRANSACTION;\nINSERT INTO claims(id) VALUES('fake');\nCOMMIT;",
  "BEGIN TRANSACTION;\nINSERT INTO source_candidates(id) VALUES('a');\nDROP TABLE companies;\nCOMMIT;"
 ]){
  assert.throws(()=>stripSQLiteTransaction(sql,{kind:'candidates'}),/unexpected statement/);
 }
 assert.throws(()=>stripSQLiteTransaction('COMMIT;\nSELECT 1;',{kind:'companies'}),/transaction|unexpected/);
 assert.throws(()=>stripSQLiteTransaction('BEGIN TRANSACTION;\nINSERT INTO companies(id) VALUES(1);',{kind:'companies'}),/Unbalanced/);
});
test('catalog import refuses a mismatched manifest count and unresolved identity conflicts',()=>{
 const goodCompanies="INSERT INTO companies(id) VALUES('abc');",goodCandidates="INSERT INTO source_candidates(id) VALUES('c1');";
 const manifest={schemaVersion:1,sourceChecks:[{connector:'otm-startups'}],
  collection:{additionalResearchParkImportable:1,distinctCandidates:1},sourceIdentityConflicts:[]};
 assert.doesNotThrow(()=>buildD1CatalogFile({companies:goodCompanies,candidates:goodCandidates,manifest}));
 assert.throws(()=>buildD1CatalogFile({companies:goodCompanies,candidates:goodCandidates,
  manifest:{...manifest,collection:{...manifest.collection,distinctCandidates:2}}}),/count differs/);
 assert.throws(()=>buildD1CatalogFile({companies:goodCompanies,candidates:goodCandidates,
  manifest:{...manifest,sourceIdentityConflicts:[{name:'Conflict'}]}}),/identity conflicts/);
});
