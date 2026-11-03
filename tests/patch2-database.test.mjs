import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {candidateStatements,approvalStatements,newIVentureCompany,newEnterpriseWorksCompany} from '../core/source-candidates.mjs';
import {recordStatements} from '../core/records.mjs';
import {SUMMARY_SQL} from '../core/methodology.mjs';

const at='2026-11-03T12:00:00.000Z';
const records=JSON.parse(readFileSync(new URL('../data/import.json',import.meta.url),'utf8'));
const sql=n=>readFileSync(new URL('../drizzle/'+n,import.meta.url),'utf8');
function store(){const d=new DatabaseSync(':memory:');d.exec('PRAGMA foreign_keys=ON;');d.exec(sql('0000_first_drax.sql'));d.exec(sql('0001_source_refresh.sql'));return d;}
const withDb=(name,fn)=>test(name,async()=>{const d=store();try{await fn(d);}finally{d.close();}});
async function put(d,record){for(const x of await recordStatements(record))d.prepare(x.sql).run(...x.values);}
async function queue(d,overrides={}){
 const c={connector:'iventure-cohorts',externalId:'cohort-11:test-ai',sourceUrl:'https://iventure.illinois.edu/startups',publisher:'iVenture Accelerator',
  title:'Test AI — iVenture cohort 11',excerpt:'iVenture 11 includes Test AI',companyName:'Test AI',companyId:null,eventDate:null,
  payload:{cohort:11,ventureWebsite:'https://test-ai.example.org/'},...overrides};
 const q=await candidateStatements(c,at);d.prepare(q.sql).run(...q.values);return d.prepare('SELECT * FROM source_candidates WHERE id=?').get(q.id);
}
withDb('Patch 2 migrations are additive and do not mutate original company or claims tables',async d=>{
 for(const r of records)await put(d,r);
 const before=d.prepare(SUMMARY_SQL).get();
 d.exec(sql('0001_source_refresh.sql'));
 assert.deepEqual(d.prepare(SUMMARY_SQL).get(),before);
 assert.equal(d.prepare('SELECT count(*) n FROM source_candidates').get().n,0);
 assert.equal(d.prepare('SELECT count(*) n FROM refresh_leases').get().n,0);
});
withDb('foreign key constraints reject orphan candidates',async d=>{
 const row=await queue(d);
 assert.equal(row.company_id,null);
 assert.throws(()=>d.prepare('UPDATE source_candidates SET company_id=? WHERE id=?').run('nonexistent',row.id),/FOREIGN KEY/);
});
withDb('candidate unique identity is idempotent even across repeated observation timestamps',async d=>{
 const row=await queue(d);
 const q=await candidateStatements({connector:'iventure-cohorts',externalId:'cohort-11:test-ai',sourceUrl:'https://iventure.illinois.edu/startups',publisher:'iVenture Accelerator',
 title:'Test AI — iVenture cohort 11',excerpt:'iVenture 11 includes Test AI',companyName:'Test AI',companyId:null,eventDate:null,
 payload:{cohort:11,ventureWebsite:'https://test-ai.example.org/'}},'2026-11-04T12:00:00.000Z');
 assert.equal(q.id,row.id);
 d.prepare(q.sql).run(...q.values);
 assert.equal(d.prepare('SELECT count(*) n FROM source_candidates').get().n,1);
 assert.equal(d.prepare('SELECT status FROM source_candidates').get().status,'Pending');
});
withDb('approved or rejected candidates cannot be decided a second time in SQLite',async d=>{
 const row=await queue(d);
 d.prepare('UPDATE source_candidates SET status=? WHERE id=?').run('Rejected',row.id);
 assert.throws(()=>d.prepare('UPDATE source_candidates SET status=? WHERE id=?').run('Approved',row.id),/pending|review|status/i);
 assert.equal(d.prepare('SELECT status FROM source_candidates').get().status,'Rejected');
});
withDb('review decision SQL must prohibit invalid workflow state transitions',async d=>{
 const row=await queue(d);
 for(const value of ['Published','Verified','running','', 'Bogus']){
  assert.throws(()=>d.prepare('UPDATE source_candidates SET status=? WHERE id=?').run(value,row.id),/status|decision|review/i);
 }
 assert.equal(d.prepare('SELECT status FROM source_candidates').get().status,'Pending');
});
withDb('review rollback is atomic if a later evidence insertion fails',async d=>{
 const row=await queue(d);
 d.exec('BEGIN');
 try{
  d.prepare("UPDATE source_candidates SET status='Approved' WHERE id=?").run(row.id);
  assert.throws(()=>d.prepare('INSERT INTO evidence(id,claim_id,source_id,excerpt,method,verified_at) VALUES(?,?,?,?,?,?)').run('orphan','bad-claim','bad-source','x','x',at),/FOREIGN KEY/);
  d.exec('ROLLBACK');
 }catch(e){d.exec('ROLLBACK');throw e;}
 assert.equal(d.prepare('SELECT status FROM source_candidates').get().status,'Pending');
});
withDb('program approval preserves source and evidence and does not produce funding or performance claims',async d=>{
 const first=records.find(x=>x.slug==='archean-sciences');
 await put(d,first);
 const row=await queue(d,{connector:'enterpriseworks-directory',externalId:'https://researchpark.illinois.edu/archean-sciences/',
  sourceUrl:'https://researchpark.illinois.edu/category/tenant-directory/enterpriseworks-incubator/',
  companyId:first.slug,companyName:first.name,title:'Archean Sciences — EnterpriseWorks',
  excerpt:'Archean Sciences · EnterpriseWorks Incubator · Tenant Directory',
  payload:{profileUrl:'https://researchpark.illinois.edu/archean-sciences/',sourceCategories:['Tenant Directory','EnterpriseWorks Incubator']}});
 for(const op of await approvalStatements(row,at))d.prepare(op.sql).run(...op.values);
 const claims=d.prepare("SELECT field,classification,status FROM claims WHERE field='incubator'").all();
 assert.deepEqual(claims,[{field:'incubator',classification:'Verified factual',status:'Published'}]);
 assert.equal(d.prepare("SELECT count(*) n FROM evidence e JOIN claims c ON c.id=e.claim_id WHERE c.field='incubator' AND e.relationship='supports'").get().n,1);
 assert.equal(d.prepare("SELECT count(*) n FROM claims WHERE field IN ('university ownership','equity funding','revenue','student founder')").get().n,0);
 assert.equal(d.prepare('SELECT count(*) n FROM signals').get().n,0);
});
withDb('reapproval of the same source does not duplicate the underlying claim or source history',async d=>{
 const row=await queue(d);
 const company=await newIVentureCompany(row,at);
 d.prepare(company.statement.sql).run(...company.statement.values);
 const approved={...row,company_id:company.companyId};
 for(let i=0;i<2;i++)for(const op of await approvalStatements(approved,at))d.prepare(op.sql).run(...op.values);
 assert.equal(d.prepare('SELECT count(*) n FROM sources').get().n,1);
 assert.equal(d.prepare('SELECT count(*) n FROM claims').get().n,1);
 assert.equal(d.prepare('SELECT count(*) n FROM evidence').get().n,1);
 assert.equal(d.prepare('SELECT count(*) n FROM affiliations').get().n,1);
 assert.equal(d.prepare('SELECT count(*) n FROM source_history').get().n,1);
});
withDb('source metadata and citations are not silently removed when new candidates are rejected',async d=>{
 const row=await queue(d);
 const company=await newIVentureCompany(row,at);
 d.prepare(company.statement.sql).run(...company.statement.values);
 for(const o of await approvalStatements({...row,company_id:company.companyId},at))d.prepare(o.sql).run(...o.values);
 const count=d.prepare('SELECT count(*) n FROM evidence').get().n;
 await queue(d,{externalId:'cohort-12:test-ai',title:'Test AI — iVenture cohort 12',payload:{cohort:12,ventureWebsite:'https://test-ai.example.org/'}});
 const pending=d.prepare("SELECT id FROM source_candidates WHERE id<>?").get(row.id);
 d.prepare('UPDATE source_candidates SET status=? WHERE id=?').run('Rejected',pending.id);
 assert.equal(d.prepare('SELECT count(*) n FROM evidence').get().n,count);
});
withDb('unmatched EnterpriseWorks profile and iVenture website must remain distinct',async d=>{
 const enterprise=await queue(d,{connector:'enterpriseworks-directory',
  sourceUrl:'https://researchpark.illinois.edu/category/tenant-directory/enterpriseworks-incubator/',
  externalId:'https://researchpark.illinois.edu/incubator-venture/',
  title:'Test AI — EnterpriseWorks',payload:{profileUrl:'https://researchpark.illinois.edu/incubator-venture/'}});
 const incubator=await newEnterpriseWorksCompany(enterprise,at);
 assert.equal(incubator.statement.values[2],'https://researchpark.illinois.edu/incubator-venture/');
 const accelerator=await newIVentureCompany(await queue(d,{externalId:'cohort-11:test-ai-other'}),at);
 assert.equal(accelerator.statement.values[2],'https://test-ai.example.org/');
});
