import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {recordStatements,report,screeningSnapshot} from '../core/records.mjs';
import {refreshConnector} from '../core/refresh-runner.mjs';
import {parseEnterpriseWorksCandidates} from '../core/source-adapters.mjs';
import {candidateStatements} from '../core/source-candidates.mjs';
import {decideSourceCandidate} from '../core/review-service.mjs';
import {validateRefreshResponse} from '../core/refresh-contract.mjs';
import {SUMMARY_SQL} from '../core/methodology.mjs';
const at='2026-11-04T12:00:00.000Z';
const seeds=JSON.parse(readFileSync(new URL('../data/import.json',import.meta.url),'utf8'));
const original=seeds.find(r=>r.slug==='archean-sciences');
assert.ok(original,'The reviewed Archean Sciences company is a required integration fixture');

function store(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('PRAGMA foreign_keys=ON;');
 for(const name of ['0000_first_drax.sql','0001_source_refresh.sql'])
  sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 const db={
  prepare(sql){return {bind(...values){return {
   async all(){return {results:sqlite.prepare(sql).all(...values)};},
   async run(){const r=sqlite.prepare(sql).run(...values);return {meta:{changes:r.changes}};}
  };}}},
  async batch(statements){
   sqlite.exec('BEGIN');
   try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}
   catch(e){sqlite.exec('ROLLBACK');throw e;}
  }
 };
 return {sqlite,db};
}
const integrated=(name,fn)=>test(name,async()=>{
 const {sqlite,db}=store();
 try{
  for(const r of seeds)for(const op of await recordStatements(r))sqlite.prepare(op.sql).run(...op.values);
  await fn(sqlite,db);
 }finally{sqlite.close();}
});
const enterpriseHTML='<article><a rel="category tag">EnterpriseWorks Incubator</a><a rel="category tag">Tenant Directory</a>'+
 '<h2 class="entry-title"><a href="'+original.profile+'">'+original.name+'</a></h2></article>';

integrated('29 reviewed seed records remain stable across a real refresh job and its validated receipt',async(sqlite,db)=>{
 const before=sqlite.prepare(SUMMARY_SQL).get();
 const receipt=await refreshConnector(db,'research-park-1',{
  directoryCollector:async()=>[original],now:at
 });
 assert.deepEqual(validateRefreshResponse('research-park-1',receipt),receipt);
 assert.equal(receipt.imported,1);
 assert.equal(receipt.observed,1);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM ingestion_jobs WHERE status=?').get('Succeeded').n,1);
 assert.deepEqual(sqlite.prepare(SUMMARY_SQL).get(),before);
});
integrated('changed identity defers into review queue rather than overwriting reviewed company',async(sqlite,db)=>{
 const source={...original,name:'Not The Same Company'};
 const receipt=await refreshConnector(db,'research-park-1',{directoryCollector:async()=>[source],now:at});
 assert.equal(validateRefreshResponse('research-park-1',receipt).deferred,1);
 assert.equal(receipt.imported,0);
 assert.equal(sqlite.prepare('SELECT name FROM companies WHERE id=?').get(original.slug).name,original.name);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM review_queue WHERE status='Pending'").get().n,1);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM companies').get().n,seeds.length);
});
integrated('approved EnterpriseWorks participation is distinct from investment backing and preserves user workspaces',async(sqlite,db)=>{
 const originalSource=sqlite.prepare(SUMMARY_SQL).get();
 sqlite.prepare('INSERT INTO workspace(id,user_id,kind,key,value,updated_at) VALUES(?,?,?,?,?,?)')
  .run('private-a','investor-a','note',original.slug,'Confidential A',at);
 sqlite.prepare('INSERT INTO workspace(id,user_id,kind,key,value,updated_at) VALUES(?,?,?,?,?,?)')
  .run('private-b','investor-b','note',original.slug,'Confidential B',at);
 const parsed=parseEnterpriseWorksCandidates(enterpriseHTML,[{id:original.slug,name:original.name}],at);
 assert.equal(parsed.length,1);
 const staged=await candidateStatements(parsed[0],at);
 sqlite.prepare(staged.sql).run(...staged.values);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM companies').get().n,seeds.length);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM claims WHERE field='incubator'").get().n,0);
 await decideSourceCandidate(db,{id:staged.id,decision:'approve',now:at});
 assert.equal(sqlite.prepare('SELECT count(*) n FROM companies').get().n,seeds.length);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM claims WHERE field='incubator'").get().n,1);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM claims WHERE field IN ('equity funding','university ownership','revenue')").get().n,0);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM signals").get().n,0);
 assert.equal(sqlite.prepare('SELECT value FROM workspace WHERE id=?').get('private-a').value,'Confidential A');
 assert.equal(sqlite.prepare('SELECT value FROM workspace WHERE id=?').get('private-b').value,'Confidential B');
 assert.equal(sqlite.prepare(SUMMARY_SQL).get().companies,originalSource.companies);
 const claims=sqlite.prepare("SELECT * FROM claims WHERE company_id=? AND field='incubator'").all(original.slug).map(c=>({
  ...c,evidence:sqlite.prepare('SELECT e.*,s.url,s.title,s.publisher,s.retrieved_at,s.last_checked FROM evidence e JOIN sources s ON s.id=e.source_id WHERE e.claim_id=?').all(c.id)
 }));
 const output=report({name:original.name,updated_at:at,claims});
 assert.match(output,/EnterpriseWorks Incubator/);
 assert.ok(!output.includes('Confidential A'));
 assert.ok(!output.includes('Confidential B'));
 const snapshot=screeningSnapshot({id:original.slug,name:original.name,claims},
  {sector:'Robotics',weights:{sector:100,stage:0,keywords:0,progress:0}},at);
 assert.equal(snapshot.result.score,null);
});
