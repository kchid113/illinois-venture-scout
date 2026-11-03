import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {candidateStatements,approvalStatements,newIVentureCompany,newEnterpriseWorksCompany,matchCompany,normalizeCompanyName,mentionsCompany} from '../core/source-candidates.mjs';
import {parseNewsCandidates,parseOTMCandidates,parseIVentureCandidates,parseEnterpriseWorksCandidates,nihCandidates,usaSpendingCandidates} from '../core/source-adapters.mjs';
import {recordStatements} from '../core/records.mjs';
import {refreshConnector} from '../core/refresh-runner.mjs';

const at='2026-11-03T12:00:00.000Z';
const records=JSON.parse(readFileSync(new URL('../data/import.json',import.meta.url),'utf8'));
function store(){
 const d=new DatabaseSync(':memory:');
 d.exec(readFileSync(new URL('../drizzle/0000_first_drax.sql',import.meta.url),'utf8'));
 d.exec(readFileSync(new URL('../drizzle/0001_source_refresh.sql',import.meta.url),'utf8'));
 const db={
  prepare(sql){return {bind(...values){return {
   async all(){return {results:d.prepare(sql).all(...values)};},
   async run(){const r=d.prepare(sql).run(...values);return {meta:{changes:r.changes}};}
  };}};},
  async batch(queries){d.exec('BEGIN');try{const r=[];for(const query of queries)r.push(await query.run());d.exec('COMMIT');return r;}catch(e){d.exec('ROLLBACK');throw e;}}
 };
 return {d,db};
}
async function put(d,record){for(const o of await recordStatements(record))d.prepare(o.sql).run(...o.values);}
const companies=[{id:'forgebee',name:'ForgeBee'},{id:'glucosentient',name:'GlucoSentient'},{id:'forge',name:'Forge'}];
const news='<article><h2 class="entry-title"><a href="https://researchpark.illinois.edu/forgebee-finalist/">ForgeBee Named Finalist in Momentum Awards</a></h2><time datetime="2026-08-05"></time></article>';
const cohort='<h2>Startups by Cohort</h2><h3>iVenture 11</h3><h4><a href="https://www.lanetrax.app/">LaneTrax</a></h4><p>Tracks bowling scores.</p><h4>Second Chance Innovations</h4><p>Post-stroke rehabilitation startup.</p><h3>iVenture 10</h3><h4><a href="https://www.pathlit.com/">Pathlit</a></h4><p>Software for teams.</p><h2>Apply</h2><h4>Not a venture</h4>';

test('strict company matching requires a whole exact identity',()=>{
 assert.equal(normalizeCompanyName('  GlucoSentient  '),'glucosentient');
 assert.equal(matchCompany('GlucoSentient',companies).id,'glucosentient');
 assert.equal(matchCompany('Forge',[...companies,{id:'clone',name:'Forge'}]),null);
 assert.equal(matchCompany('ForgeBee Labs',companies),null);
 assert.equal(mentionsCompany('ForgeBee Named Finalist','Forge'),false);
 assert.equal(mentionsCompany('ForgeBee Named Finalist','ForgeBee'),true);
});

test('official news becomes a review-only candidate with event date',()=>{
 const found=parseNewsCandidates(news,'research-park-news',companies,at);
 assert.equal(found.length,1);
 assert.equal(found[0].companyId,'forgebee');
 assert.equal(found[0].eventDate,'2026-08-05');
 assert.ok(found[0].sourceUrl.startsWith('https://researchpark.illinois.edu/'));
 assert.equal(parseOTMCandidates('<article class="startup"><h3><a href="https://otm.illinois.edu/startups/forgebee/">ForgeBee</a></h3></article>',companies,at).length,1);
});

test('iVenture cohort parser distinguishes exact matches, new ventures and cohorts',()=>{
 const found=parseIVentureCandidates(cohort,[{id:'second-chance-innovations',name:'Second Chance Innovations'}],at);
 assert.equal(found.length,3);
 const existing=found.find(x=>x.companyName==='Second Chance Innovations');
 const newVenture=found.find(x=>x.companyName==='LaneTrax');
 assert.equal(existing.companyId,'second-chance-innovations');
 assert.equal(newVenture.companyId,null);
 assert.equal(newVenture.payload.cohort,11);
 assert.equal(newVenture.payload.ventureWebsite,'https://www.lanetrax.app/');
 assert.equal(found.find(x=>x.companyName==='Pathlit').payload.cohort,10);
 assert.ok(!found.some(x=>x.companyName==='Not a venture'));
 assert.throws(()=>parseIVentureCandidates('<h2>No cohort available</h2>',[],at),/layout changed/);
});

test('candidate SQL is idempotent and never makes a public claim before approval',async()=>{
 const {d}=store();
 const candidate=parseIVentureCandidates(cohort,[],at).find(x=>x.companyName==='LaneTrax');
 const stmt=await candidateStatements(candidate,at);
 d.prepare(stmt.sql).run(...stmt.values);
 d.prepare(stmt.sql).run(...stmt.values);
 assert.equal(d.prepare('SELECT count(*) n FROM source_candidates').get().n,1);
 assert.equal(d.prepare('SELECT status FROM source_candidates').get().status,'Pending');
 assert.equal(d.prepare('SELECT count(*) n FROM claims').get().n,0);
 d.close();
});

test('approved iVenture affiliation is exactly scoped and cited, not a spinout or event',async()=>{
 const {d}=store();
 await put(d,records.find(x=>x.slug==='second-chance-innovations'));
 const candidate=parseIVentureCandidates(cohort,[{id:'second-chance-innovations',name:'Second Chance Innovations'}],at).find(x=>x.companyName==='Second Chance Innovations');
 const stmt=await candidateStatements(candidate,at);
 d.prepare(stmt.sql).run(...stmt.values);
 const row=d.prepare('SELECT * FROM source_candidates WHERE id=?').get(stmt.id);
 for(const op of await approvalStatements(row,at))d.prepare(op.sql).run(...op.values);
 const claim=d.prepare("SELECT * FROM claims WHERE company_id='second-chance-innovations' AND field='accelerator'").get();
 assert.equal(claim.value,'iVenture Accelerator cohort 11 participant');
 assert.equal(claim.status,'Published');
 assert.equal(d.prepare("SELECT count(*) n FROM evidence WHERE claim_id=? AND relationship='supports'").get(claim.id).n,1);
 assert.equal(d.prepare("SELECT count(*) n FROM affiliations WHERE type='iVenture cohort 11 participant'").get().n,1);
 assert.equal(d.prepare('SELECT count(*) n FROM signals').get().n,0);
 assert.equal(d.prepare("SELECT count(*) n FROM claims WHERE field='funding'").get().n,0);
 d.close();
});

test('reviewed unmatched iVenture venture needs a real website and explicit creation',async()=>{
 const candidate=parseIVentureCandidates(cohort,[],at).find(x=>x.companyName==='LaneTrax');
 const {d}=store();const stmt=await candidateStatements(candidate,at);
 d.prepare(stmt.sql).run(...stmt.values);
 const row=d.prepare('SELECT * FROM source_candidates').get();
 const {companyId,statement}=await newIVentureCompany(row,at);
 d.prepare(statement.sql).run(...statement.values);
 for(const o of await approvalStatements({...row,company_id:companyId},at))d.prepare(o.sql).run(...o.values);
 const company=d.prepare('SELECT * FROM companies WHERE id=?').get(companyId);
 assert.equal(company.name,'LaneTrax');assert.equal(company.profile,'https://www.lanetrax.app/');
 assert.equal(d.prepare("SELECT count(*) n FROM claims WHERE field='accelerator'").get().n,1);
 assert.equal(d.prepare("SELECT count(*) n FROM claims WHERE field='affiliation'").get().n,0);
 const noWebsite={...row,payload:JSON.stringify({cohort:11,ventureWebsite:null})};
 await assert.rejects(()=>newIVentureCompany(noWebsite,at),/no linked venture website/);
 await assert.rejects(()=>newIVentureCompany({...row,connector:'nih-reporter'},at),/Only unmatched/);
 d.close();
});

test('NIH exact recipient identity rejects mismatches and missing amounts remain unknown',async()=>{
 const json={results:[{appl_id:123,project_title:'Awarded Project',project_num:'R01-A1',organization:{org_name:'Verified Org'},award_amount:null},{appl_id:124,organization:{org_name:'Other Corp'},award_amount:900}]};
 const fake=async()=>new Response(JSON.stringify(json),{status:200});
 const found=await nihCandidates({id:'v',name:'Verified Org'},'Verified Org',at,fake);
 assert.equal(found.length,1);
 assert.equal(found[0].payload.awardAmount,null);
 assert.ok(found[0].excerpt.includes('Award amount not stated'));
});

test('USAspending requires verified UEI exact match; unknown amount does not become zero',async()=>{
 const uei='ABCDEF123456',json={results:[{'Recipient UEI':uei,'Award ID':'A-1',generated_internal_id:'ASST-A1','Award Amount':null,'Award Type':'Contract'},{'Recipient UEI':'WRONG123456','Award ID':'A-2',generated_internal_id:'ASST-A2','Award Amount':900}]};
 const fake=async()=>new Response(JSON.stringify(json),{status:200});
 const rows=await usaSpendingCandidates({id:'v',name:'Verified Org'},uei,at,fake);
 assert.equal(rows.length,1);
 assert.equal(rows[0].payload.amount,null);
 assert.ok(!rows[0].excerpt.includes('USD'));
 await assert.rejects(()=>usaSpendingCandidates({id:'v'},'Not a UEI',at,fake),/UEI/);
});

test('refresh runner queues iVenture candidates and logs jobs without publishing',async()=>{
 const {d,db}=store();
 const fetcher=async url=>new Response(String(url).endsWith('/robots.txt')?'User-agent: *\nAllow: /\n':cohort,{status:200});
 const result=await refreshConnector(db,'iventure-cohorts',{fetcher,now:at});
 assert.equal(result.observed,3);
 assert.equal(result.staged,3);
 assert.equal(result.imported,0);
 assert.equal(d.prepare('SELECT count(*) n FROM claims').get().n,0);
 assert.equal(d.prepare("SELECT count(*) n FROM source_candidates WHERE status='Pending'").get().n,3);
 assert.equal(d.prepare("SELECT status FROM ingestion_jobs").get().status,'Succeeded');
 const repeat=await refreshConnector(db,'iventure-cohorts',{fetcher,now:at});
 assert.equal(repeat.staged,0);
 assert.equal(d.prepare('SELECT count(*) n FROM source_candidates').get().n,3);
 d.close();
});


const enterpriseHTML=[
 '<article><a rel="category tag">EnterpriseWorks Incubator</a><a rel="category tag">Tenant Directory</a>',
 '<h2 class="entry-title"><a href="https://researchpark.illinois.edu/archean-sciences/">Archean Sciences</a></h2></article>',
 '<article><a rel="category tag">EnterpriseWorks Incubator</a><a rel="category tag">Tenant Directory</a>',
 '<h2 class="entry-title"><a href="https://researchpark.illinois.edu/cleanslate-robotics/">Cleanslate Robotics</a></h2></article>',
 '<article><a rel="category tag">Tenant Directory</a><a rel="category tag">Corporate Innovation Site</a>',
 '<h2 class="entry-title"><a href="https://researchpark.illinois.edu/corporate-tenant/">Corporate Tenant</a></h2></article>'
].join('');

test('EnterpriseWorks connector includes incubator listings even without generic Startup tag',()=>{
 const found=parseEnterpriseWorksCandidates(enterpriseHTML,[{id:'archean-sciences',name:'Archean Sciences'}],at);
 assert.equal(found.length,2);
 const existing=found.find(x=>x.companyName==='Archean Sciences');
 const prospective=found.find(x=>x.companyName==='Cleanslate Robotics');
 assert.equal(existing.companyId,'archean-sciences');
 assert.equal(prospective.companyId,null);
 assert.equal(prospective.payload.profileUrl,'https://researchpark.illinois.edu/cleanslate-robotics/');
 assert.equal(prospective.payload.sourceCategories.includes('EnterpriseWorks Incubator'),true);
 assert.equal(found[0].sourceUrl,'https://researchpark.illinois.edu/category/tenant-directory/enterpriseworks-incubator/');
 assert.ok(!found.some(x=>x.companyName==='Corporate Tenant'));
 assert.throws(()=>parseEnterpriseWorksCandidates('<h2>Page layout changed</h2>',[],at),/no qualifying tagged records/);
});

test('EnterpriseWorks exact-matched affiliation is distinct from university ownership or financial signals',async()=>{
 const {d}=store();
 await put(d,records.find(x=>x.slug==='archean-sciences'));
 const candidate=parseEnterpriseWorksCandidates(enterpriseHTML,[{id:'archean-sciences',name:'Archean Sciences'}],at)[0];
 const statement=await candidateStatements(candidate,at);
 d.prepare(statement.sql).run(...statement.values);
 for(const o of await approvalStatements(d.prepare('SELECT * FROM source_candidates').get(),at))d.prepare(o.sql).run(...o.values);
 const c=d.prepare("SELECT * FROM claims WHERE field='incubator'").get();
 assert.equal(c.value,'Listed in the official EnterpriseWorks Incubator directory');
 assert.equal(c.classification,'Verified factual');
 assert.equal(d.prepare("SELECT count(*) n FROM evidence WHERE claim_id=? AND relationship='supports'").get(c.id).n,1);
 assert.equal(d.prepare("SELECT count(*) n FROM affiliations WHERE type='EnterpriseWorks Incubator directory listing'").get().n,1);
 assert.equal(d.prepare("SELECT count(*) n FROM claims WHERE field IN ('equity funding','university ownership','student founder')").get().n,0);
 assert.equal(d.prepare("SELECT count(*) n FROM signals").get().n,0);
 d.close();
});

test('new EnterpriseWorks venture requires reviewed directory profile and stays unclassified otherwise',async()=>{
 const {d}=store();
 const candidate=parseEnterpriseWorksCandidates(enterpriseHTML,[],at).find(x=>x.companyName==='Cleanslate Robotics');
 const statement=await candidateStatements(candidate,at);
 d.prepare(statement.sql).run(...statement.values);
 const row=d.prepare('SELECT * FROM source_candidates').get();
 const {companyId,statement:companyOp}=await newEnterpriseWorksCompany(row,at);
 d.prepare(companyOp.sql).run(...companyOp.values);
 assert.equal(d.prepare('SELECT name FROM companies WHERE id=?').get(companyId).name,'Cleanslate Robotics');
 for(const o of await approvalStatements({...row,company_id:companyId},at))d.prepare(o.sql).run(...o.values);
 assert.equal(d.prepare("SELECT count(*) n FROM claims WHERE field='incubator'").get().n,1);
 assert.equal(d.prepare("SELECT count(*) n FROM claims WHERE field='affiliation'").get().n,0);
 const bad={...row,payload:JSON.stringify({...JSON.parse(row.payload),profileUrl:'https://example.com/fake'})};
 await assert.rejects(()=>newEnterpriseWorksCompany(bad,at),/Research Park official profile/);
 await assert.rejects(()=>newEnterpriseWorksCompany({...row,connector:'iventure-cohorts'},at),/Only unmatched EnterpriseWorks/);
 d.close();
});

test('EnterpriseWorks scheduled refresh stages candidates without auto-publishing companies',async()=>{
 const {d,db}=store();
 const fetcher=async url=>new Response(String(url).endsWith('/robots.txt')?'User-agent: *\nAllow: /\n':enterpriseHTML,{status:200});
 const result=await refreshConnector(db,'enterpriseworks-directory',{fetcher,now:at});
 assert.equal(result.observed,2);
 assert.equal(result.staged,2);
 assert.equal(result.imported,0);
 assert.equal(d.prepare('SELECT count(*) n FROM companies').get().n,0);
 assert.equal(d.prepare('SELECT count(*) n FROM claims').get().n,0);
 const second=await refreshConnector(db,'enterpriseworks-directory',{fetcher,now:at});
 assert.equal(second.staged,0);
 assert.equal(d.prepare('SELECT count(*) n FROM source_candidates').get().n,2);
 d.close();
});
