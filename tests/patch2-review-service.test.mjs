import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {candidateStatements} from '../core/source-candidates.mjs';
import {decideSourceCandidate,ReviewError} from '../core/review-service.mjs';
import {recordStatements} from '../core/records.mjs';

const at='2026-11-03T12:00:00.000Z',at2='2026-11-04T12:00:00.000Z';
const records=JSON.parse(readFileSync(new URL('../data/import.json',import.meta.url),'utf8'));
function create(){
 const d=new DatabaseSync(':memory:');
 d.exec('PRAGMA foreign_keys=ON;');
 for(const migration of ['0000_first_drax.sql','0001_source_refresh.sql'])
  d.exec(readFileSync(new URL('../drizzle/'+migration,import.meta.url),'utf8'));
 const db={
  prepare(sql){return {bind(...values){return {
   async all(){return {results:d.prepare(sql).all(...values)};},
   async run(){const r=d.prepare(sql).run(...values);return {meta:{changes:r.changes}};}
  };}}},
  async batch(prepared){d.exec('BEGIN');try{
   const out=[];for(const p of prepared)out.push(await p.run());
   d.exec('COMMIT');return out;
  }catch(e){d.exec('ROLLBACK');throw e;}}
 };
 return {d,db};
}
async function queued(d,overrides={}){
 const value={connector:'iventure-cohorts',externalId:'cohort-11:fresh-lab',sourceUrl:'https://iventure.illinois.edu/startups',
  title:'Fresh Lab — iVenture cohort 11',publisher:'iVenture Accelerator',
  excerpt:'Official cohort 11 lists Fresh Lab',companyName:'Fresh Lab',companyId:null,
  eventDate:null,payload:{cohort:11,ventureWebsite:'https://fresh-lab.example.org/'},...overrides};
 const s=await candidateStatements(value,at);
 d.prepare(s.sql).run(...s.values);
 return s.id;
}
async function addCompany(d,name){
 const r=records.find(x=>x.name===name);
 assert.ok(r,'seed company fixture missing');
 for(const x of await recordStatements(r))d.prepare(x.sql).run(...x.values);
 return r;
}
async function reviewedExisting(d,overrides={}){
 const company=await addCompany(d,'Archean Sciences');
 const id=await queued(d,{connector:'enterpriseworks-directory',externalId:company.profile,
   sourceUrl:'https://researchpark.illinois.edu/category/tenant-directory/enterpriseworks-incubator/',
   title:'Archean Sciences — EnterpriseWorks',companyName:company.name,companyId:company.slug,
   excerpt:'Archean Sciences · Tenant Directory · EnterpriseWorks Incubator',
   payload:{profileUrl:company.profile,sourceCategories:['Tenant Directory','EnterpriseWorks Incubator']},...overrides});
 return {id,company};
}
const run=(name,fn)=>test(name,async()=>{const {d,db}=create();try{await fn(d,db);}finally{d.close();}});

run('review service approves one source-backed EnterpriseWorks affiliation, with complete audit',async(d,db)=>{
 const {id,company}=await reviewedExisting(d);
 const result=await decideSourceCandidate(db,{id,decision:'approve',now:at2});
 assert.equal(result.status,'Approved');assert.equal(result.companyId,company.slug);
 assert.equal(d.prepare('SELECT status FROM source_candidates WHERE id=?').get(id).status,'Approved');
 assert.equal(d.prepare("SELECT count(*) n FROM claims WHERE field='incubator'").get().n,1);
 assert.equal(d.prepare("SELECT count(*) n FROM evidence WHERE relationship='supports'").get().n>0,true);
 assert.equal(d.prepare('SELECT action,target FROM audit').get().action,'candidate-approve');
 assert.equal(d.prepare('SELECT count(*) n FROM companies').get().n,1);
});
run('review service rejects a lead without ever writing a source, claim, or signal',async(d,db)=>{
 const id=await queued(d);
 const r=await decideSourceCandidate(db,{id,decision:'reject',now:at2});
 assert.equal(r.status,'Rejected');
 for(const table of ['companies','claims','evidence','sources','signals','affiliations'])
  assert.equal(d.prepare('SELECT count(*) n FROM '+table).get().n,0,table);
 assert.equal(d.prepare('SELECT count(*) n FROM audit').get().n,1);
});
run('reviewing an approved or rejected candidate again returns a conflict',async(d,db)=>{
 const id=await queued(d);
 await decideSourceCandidate(db,{id,decision:'reject',now:at});
 await assert.rejects(()=>decideSourceCandidate(db,{id,decision:'approve',now:at2}),e=>e instanceof ReviewError&&e.status===409);
 assert.equal(d.prepare('SELECT count(*) n FROM audit').get().n,1);
});
run('concurrent decisions cannot publish and reject the same lead',async(d,db)=>{
 const {id}=await reviewedExisting(d);
 const settled=await Promise.allSettled([
  decideSourceCandidate(db,{id,decision:'approve',now:at}),
  decideSourceCandidate(db,{id,decision:'reject',now:at})
 ]);
 assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(settled.filter(x=>x.status==='rejected').length,1);
 assert.equal(d.prepare('SELECT count(*) n FROM audit').get().n,1);
 const status=d.prepare('SELECT status FROM source_candidates').get().status;
 assert.ok(['Approved','Rejected'].includes(status));
 assert.equal(d.prepare("SELECT count(*) n FROM claims WHERE field='incubator'").get().n,status==='Approved'?1:0);
});
run('failed approval transaction rolls candidate status and all prior inserts back',async(d,db)=>{
 const {id}=await reviewedExisting(d);
 d.exec("CREATE TRIGGER force_fail BEFORE INSERT ON sources BEGIN SELECT RAISE(ABORT, 'test source unavailable'); END;");
 await assert.rejects(()=>decideSourceCandidate(db,{id,decision:'approve',now:at2}),/transaction failed/i);
 assert.equal(d.prepare('SELECT status FROM source_candidates WHERE id=?').get(id).status,'Pending');
 assert.equal(d.prepare('SELECT count(*) n FROM audit').get().n,0);
 assert.equal(d.prepare("SELECT count(*) n FROM claims WHERE field='incubator'").get().n,0);
});
run('approval checks persisted company name, not only a valid company ID',async(d,db)=>{
 const {id}=await reviewedExisting(d,{companyName:'Different Organization'});
 await assert.rejects(()=>decideSourceCandidate(db,{id,decision:'approve',now:at}),/identity no longer matches/);
 assert.equal(d.prepare('SELECT status FROM source_candidates').get().status,'Pending');
});
run('unmatched sourced iVenture venture requires an explicit create action',async(d,db)=>{
 const id=await queued(d);
 await assert.rejects(()=>decideSourceCandidate(db,{id,decision:'approve',now:at}),/exact company match/i);
 const result=await decideSourceCandidate(db,{id,decision:'create',now:at});
 assert.equal(result.status,'Approved');
 assert.equal(d.prepare('SELECT count(*) n FROM companies').get().n,1);
 assert.equal(d.prepare("SELECT count(*) n FROM claims WHERE field='accelerator'").get().n,1);
 assert.equal(d.prepare("SELECT count(*) n FROM claims WHERE field='equity funding'").get().n,0);
 assert.equal(d.prepare('SELECT count(*) n FROM audit').get().n,1);
});
run('unmatched enterprise incubator record requires official profile before creation',async(d,db)=>{
 const id=await queued(d,{connector:'enterpriseworks-directory',
  sourceUrl:'https://researchpark.illinois.edu/category/tenant-directory/enterpriseworks-incubator/',
  payload:{profileUrl:'https://researchpark.illinois.edu/new-venture/'},
  externalId:'https://researchpark.illinois.edu/new-venture/'});
 const result=await decideSourceCandidate(db,{id,decision:'create',now:at});
 assert.equal(result.status,'Approved');
 assert.equal(d.prepare("SELECT profile FROM companies").get().profile,'https://researchpark.illinois.edu/new-venture/');
 assert.equal(d.prepare("SELECT count(*) n FROM claims WHERE field='incubator'").get().n,1);
});
run('new source cannot create a duplicate company with an existing normalized name',async(d,db)=>{
 await addCompany(d,'Archean Sciences');
 const id=await queued(d,{companyName:'ARCHEAN SCIENCES',payload:{cohort:11,ventureWebsite:'https://other.example.org/'}});
 await assert.rejects(()=>decideSourceCandidate(db,{id,decision:'create',now:at}),/already exists|uniquely/);
 assert.equal(d.prepare('SELECT count(*) n FROM companies').get().n,1);
});
run('new source cannot create another company with the same official website',async(d,db)=>{
 const id=await queued(d);
 await decideSourceCandidate(db,{id,decision:'create',now:at});
 const second=await queued(d,{companyName:'Other Venture',externalId:'cohort-12:other',title:'Other Venture cohort 12',payload:{cohort:12,ventureWebsite:'https://fresh-lab.example.org/'}});
 await assert.rejects(()=>decideSourceCandidate(db,{id:second,decision:'create',now:at}),/profile URL is already used/);
 assert.equal(d.prepare('SELECT count(*) n FROM companies').get().n,1);
});
run('reject/create inputs are validated and never alter a candidate on malformed IDs',async(d,db)=>{
 const id=await queued(d);
 for(const v of ['bad-id',''.padStart(64,'z'),'',null]){
  await assert.rejects(()=>decideSourceCandidate(db,{id:v,decision:'reject',now:at}),e=>e.status===400);
 }
 await assert.rejects(()=>decideSourceCandidate(db,{id,decision:'publish',now:at}),e=>e.status===400);
 assert.equal(d.prepare('SELECT status FROM source_candidates').get().status,'Pending');
});
run('unmatched NIH, news and OTM candidates cannot be used to create companies',async(d,db)=>{
 for(const connector of ['nih-reporter','research-park-news','otm-startups']){
  const id=await queued(d,{connector,externalId:connector,sourceUrl:connector==='nih-reporter'?'https://reporter.nih.gov/project-details/123':
   connector==='research-park-news'?'https://researchpark.illinois.edu/news/':'https://otm.illinois.edu/browse-technologies-startups/startups'});
  await assert.rejects(()=>decideSourceCandidate(db,{id,decision:'create',now:at}),e=>e.status===422);
 }
 assert.equal(d.prepare('SELECT count(*) n FROM companies').get().n,0);
});
