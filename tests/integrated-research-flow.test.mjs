import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {recordStatements,thesisFit,report,csv} from '../core/records.mjs';
import {SUMMARY_SQL,SIGNAL_ELIGIBILITY,SECTORS_SQL} from '../core/methodology.mjs';
import {parseEnterpriseWorksCandidates,parseIVentureCandidates,parseNewsCandidates} from '../core/source-adapters.mjs';
import {candidateStatements} from '../core/source-candidates.mjs';
import {decideSourceCandidate} from '../core/review-service.mjs';

const at='2026-11-03T12:00:00.000Z',seed=JSON.parse(readFileSync(new URL('../data/import.json',import.meta.url),'utf8'));
const enterprise='<article><a rel="category tag">EnterpriseWorks Incubator</a><a rel="category tag">Tenant Directory</a><h2 class="entry-title"><a href="https://researchpark.illinois.edu/archean-sciences/">Archean Sciences</a></h2></article>';
const iventure='<h3>iVenture 11</h3><h4>Archean Sciences</h4><h4><a href="https://new-uiuc-venture.example.org/">New UIUC Venture</a></h4>';
const news='<article><h2><a href="https://researchpark.illinois.edu/archean-research/">Archean Sciences announces new research</a></h2><time datetime="2026-10-12"></time></article>';
const companyList=[{id:'archean-sciences',name:'Archean Sciences',profile:'https://researchpark.illinois.edu/archean-sciences/'}];
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const path of ['../drizzle/0000_first_drax.sql','../drizzle/0001_source_refresh.sql'])
  sql.exec(readFileSync(new URL(path,import.meta.url),'utf8'));
 const db={prepare(text){return {bind(...values){return{
  async all(){return{results:sql.prepare(text).all(...values)};},
  async run(){const r=sql.prepare(text).run(...values);return{meta:{changes:r.changes}};}
 };}};},async batch(batch){sql.exec('BEGIN');try{const result=[];for(const stmt of batch)result.push(await stmt.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return {sql,db};
}
async function seedAll(sql){
 for(const r of seed)for(const op of await recordStatements(r))sql.prepare(op.sql).run(...op.values);
}
async function queue(sql,candidate){
 const op=await candidateStatements(candidate,at);sql.prepare(op.sql).run(...op.values);return op.id;
}
const testDB=(name,fn)=>test(name,async()=>{
 const {sql,db}=fixture();try{await seedAll(sql);await fn(sql,db);}finally{sql.close();}
});
testDB('initial 29 authentic companies coexist with unapproved accelerator and incubator leads',async(sql)=>{
 const baseline=sql.prepare(SUMMARY_SQL).get();
 const candidates=[...parseEnterpriseWorksCandidates(enterprise,companyList,at),...parseIVentureCandidates(iventure,companyList,at)];
 for(const lead of candidates)await queue(sql,lead);
 assert.equal(sql.prepare('SELECT count(*) n FROM source_candidates').get().n,3);
 assert.equal(sql.prepare('SELECT count(*) n FROM companies').get().n,29);
 assert.deepEqual(sql.prepare(SUMMARY_SQL).get(),baseline);
 assert.equal(sql.prepare("SELECT count(*) n FROM claims WHERE field IN ('accelerator','incubator')").get().n,0);
});
testDB('reviewing multiple real ecosystem paths retains distinct affiliation evidence',async(sql,db)=>{
 const a=parseEnterpriseWorksCandidates(enterprise,companyList,at)[0],
  b=parseIVentureCandidates(iventure,companyList,at).find(x=>x.companyName==='Archean Sciences');
 const ids=[await queue(sql,a),await queue(sql,b)];
 for(const id of ids)await decideSourceCandidate(db,{id,decision:'approve',now:at});
 const claims=sql.prepare("SELECT field,value,classification FROM claims WHERE company_id='archean-sciences' AND field IN ('incubator','accelerator') ORDER BY field").all();
 assert.deepEqual(claims.map(x=>x.field),['accelerator','incubator']);
 assert.ok(claims.every(x=>x.classification==='Verified factual'));
 assert.equal(sql.prepare('SELECT count(*) n FROM source_candidates WHERE status=?').get('Approved').n,2);
 assert.equal(sql.prepare("SELECT count(*) n FROM evidence e JOIN claims c ON c.id=e.claim_id WHERE c.field IN ('accelerator','incubator') AND e.relationship='supports'").get().n,2);
 assert.equal(sql.prepare("SELECT count(*) n FROM claims WHERE field IN ('university ownership','funding','equity funding','revenue')").get().n,0);
 assert.equal(sql.prepare('SELECT count(*) n FROM companies').get().n,29);
});
testDB('news-only discovery never increases verified signal count before approval',async(sql,db)=>{
 const result=parseNewsCandidates(news,'research-park-news',companyList,at);
 assert.equal(result.length,1);
 const id=await queue(sql,result[0]);
 const before=sql.prepare('SELECT count(*) n FROM signals').get().n;
 assert.equal(before,0);
 assert.equal(sql.prepare(SUMMARY_SQL).get().signals,0);
 await decideSourceCandidate(db,{id,decision:'approve',now:at});
 assert.equal(sql.prepare(SUMMARY_SQL).get().signals,1);
 assert.equal(sql.prepare('SELECT count(*) n FROM signals s WHERE '+SIGNAL_ELIGIBILITY).get().n,1);
 assert.equal(sql.prepare('SELECT event_date FROM signals').get().event_date,'2026-10-12');
});
testDB('reviewed non-Research-Park iVenture venture adds exactly one company without inventing tenancy',async(sql,db)=>{
 const before=sql.prepare(SUMMARY_SQL).get(),sectorBefore=sql.prepare(SECTORS_SQL).all();
 const candidate=parseIVentureCandidates(iventure,companyList,at).find(x=>x.companyName==='New UIUC Venture');
 assert.equal(candidate.companyId,null);
 const id=await queue(sql,candidate);
 await decideSourceCandidate(db,{id,decision:'create',now:at});
 const after=sql.prepare(SUMMARY_SQL).get();
 assert.equal(after.companies,before.companies+1);
 assert.equal(sql.prepare("SELECT count(*) n FROM claims WHERE field='accelerator'").get().n,1);
 assert.equal(sql.prepare("SELECT count(*) n FROM claims WHERE field='affiliation' AND company_id LIKE 'iventure-%'").get().n,0);
 assert.equal(sql.prepare("SELECT count(*) n FROM companies WHERE id LIKE 'iventure-%'").get().n,1);
 assert.equal(sql.prepare("SELECT count(*) n FROM signals").get().n,0);
 assert.deepEqual(sql.prepare(SECTORS_SQL).all(),sectorBefore);
});
testDB('existing user notes are untouched while new public-source reviews commit',async(sql,db)=>{
 sql.prepare('INSERT INTO workspace(id,user_id,kind,key,value,updated_at) VALUES(?,?,?,?,?,?)')
  .run('note-a','investor-1','note','archean-sciences','Confidential diligence','2026-01-01');
 const candidate=parseEnterpriseWorksCandidates(enterprise,companyList,at)[0],id=await queue(sql,candidate);
 await decideSourceCandidate(db,{id,decision:'approve',now:at});
 assert.equal(sql.prepare('SELECT value FROM workspace WHERE user_id=?').get('investor-1').value,'Confidential diligence');
 assert.equal(sql.prepare('SELECT count(*) n FROM workspace').get().n,1);
});
testDB('new source claims remain unknown to thesis scoring unless tied to an entered criterion',async(sql,db)=>{
 const candidate=parseIVentureCandidates(iventure,companyList,at).find(x=>x.companyName==='Archean Sciences'),id=await queue(sql,candidate);
 await decideSourceCandidate(db,{id,decision:'approve',now:at});
 const rows=sql.prepare("SELECT id,field,value,classification,status FROM claims WHERE company_id='archean-sciences'").all();
 const claims=rows.map(c=>({...c,evidence:sql.prepare("SELECT source_id,relationship FROM evidence WHERE claim_id=?").all(c.id)}));
 const fit=thesisFit({claims},{sector:'Venture Capital',weights:{sector:100,stage:0,keywords:0,progress:0}});
 assert.ok(fit.score===null||fit.score===0);
 assert.notEqual(fit.score,100);
});
testDB('reports and CSV show reviewed research facts without turning accelerator membership into equity',async(sql,db)=>{
 const candidate=parseIVentureCandidates(iventure,companyList,at).find(x=>x.companyName==='Archean Sciences'),id=await queue(sql,candidate);
 await decideSourceCandidate(db,{id,decision:'approve',now:at});
 const claims=sql.prepare("SELECT * FROM claims WHERE company_id='archean-sciences' AND field='accelerator'").all().map(x=>({
  ...x,evidence:sql.prepare('SELECT e.*,s.url,s.title,s.publisher,s.retrieved_at,s.last_checked FROM evidence e JOIN sources s ON s.id=e.source_id WHERE e.claim_id=?').all(x.id)
 }));
 const output=report({name:'Archean Sciences',updated_at:at,claims});
 assert.match(output,/iVenture Accelerator cohort 11/);
 assert.ok(!output.includes('University ownership:'));
 assert.ok(!csv([['Archean Sciences','=HYPERLINK("http://evil")']]).includes('"=HYPERLINK'));
});
