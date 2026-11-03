import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {METRICS,DEFAULT_WEIGHTS,SCREENING_MIN_COVERAGE,METHODOLOGY_VERSION,SUMMARY_SQL,SECTORS_SQL,PROFILE_FIELDS,supportedProfileClaims} from '../core/methodology.mjs';
import {thesisFit,screeningSnapshot,recordStatements} from '../core/records.mjs';
const claim=(field,value,extra={})=>({id:field,field,value,status:'Published',classification:'Verified factual',evidence:[{source_id:'s1',url:'https://example.org/source',relationship:'supports'}],...extra});
const company={id:'fixture',name:'Synthetic test only',claims:[claim('sector','Software'),claim('description','AI infrastructure',{classification:'Company-reported'})]};
test('registry entries carry stable audit fields and current version',()=>{for(const [id,r] of Object.entries(METRICS)){assert.equal(id,r.id);assert.equal(r.version,METHODOLOGY_VERSION);for(const key of ['label','description','rule','sourceRequirements','limitations','origin'])assert.ok(r[key].length);assert.ok(r.fields.length);assert.ok(['System-derived','Source-reported','Analyst-assigned'].includes(r.origin));}assert.equal(SCREENING_MIN_COVERAGE,50);assert.deepEqual(DEFAULT_WEIGHTS,{sector:35,stage:20,keywords:25,progress:20});});
test('score contributions reconcile to numerator and denominator',()=>{const r=thesisFit(company,{sector:'Software',keywords:'biology'});assert.equal(r.totalWeight,100);assert.equal(r.knownWeight,60);assert.equal(r.matchedWeight,35);assert.equal(r.coverage,60);assert.equal(r.score,58);assert.equal(r.factors.find(f=>f.key==='keywords').contribution,0);assert.equal(r.factors.find(f=>f.key==='stage').contribution,null);assert.equal(Math.round(r.factors.reduce((s,f)=>s+(f.contribution||0),0)),r.score);});
test('blank comma-separated tokens cannot match all text',()=>{const r=thesisFit(company,{sector:'Software',keywords:'biology, ,'});assert.equal(r.factors.find(f=>f.key==='keywords').match,false);assert.equal(thesisFit(company,{sector:'  , ',keywords:','}).score,null);});
test('unsupported, analytical and conflicting factors remain unknown',()=>{for(const extra of [{status:'Conflicting'},{classification:'Analytical interpretation'},{classification:'Unverified'},{evidence:[]},{evidence:[{source_id:'s1',relationship:'contradicts'}]}]){const r=thesisFit({claims:[claim('sector','Software',extra)]},{sector:'Software',weights:{sector:100,stage:0,keywords:0,progress:0}});assert.equal(r.score,null);assert.equal(r.factors[0].match,null);}});
test('a conflicting candidate prevents cherry-picking a matching published candidate',()=>{const r=thesisFit({claims:[claim('sector','Software'),claim('sector','Biotech',{id:'second',status:'Conflicting'})]},{sector:'Software',weights:{sector:100,stage:0,keywords:0,progress:0}});assert.equal(r.score,null);assert.match(r.factors[0].reason,/Conflicting/);});
test('zero and invalid weights never return NaN or a fictional zero score',()=>{for(const weights of [{sector:0,stage:0,keywords:0,progress:0},{sector:NaN,stage:-1,keywords:Infinity,progress:0}]){const r=thesisFit(company,{sector:'Software',keywords:'AI',weights});assert.equal(r.score,null);assert.equal(r.coverage,0);assert.ok(r.factors.every(f=>f.match===null));}});
test('threshold uses unrounded coverage; exactly 50 passes',()=>{const c={claims:[claim('sector','Software')]};const low=thesisFit(c,{sector:'Software',weights:{sector:49.99,stage:50.01,keywords:0,progress:0}});assert.equal(low.coverage,49.99);assert.equal(low.score,null);assert.equal(thesisFit(c,{sector:'Software',weights:{sector:50,stage:50,keywords:0,progress:0}}).score,100);});
test('saved snapshot can reconstruct score after live claims and criteria change',()=>{const c=structuredClone(company),criteria={sector:'Software',keywords:'AI'};const snap=screeningSnapshot(c,criteria,'2026-11-03T00:00:00Z');c.claims[0].value='Biotech';criteria.sector='Other';assert.equal(snap.computedAt,'2026-11-03T00:00:00Z');assert.equal(snap.version,METHODOLOGY_VERSION);assert.deepEqual(thesisFit({claims:snap.claims},snap.criteria),snap.result);assert.equal(snap.result.score,100);});
test('summary and sector formulas match DB records and exclude unsupported sectors/signals',async()=>{const d=new DatabaseSync(':memory:');d.exec(readFileSync(new URL('../drizzle/0000_first_drax.sql',import.meta.url),'utf8'));const records=JSON.parse(readFileSync(new URL('../data/import.json',import.meta.url),'utf8'));for(const op of await recordStatements(records[0]))d.prepare(op.sql).run(...op.values);d.prepare("INSERT INTO claims(id,company_id,field,value,classification,status,first_observed,verified_at) VALUES('unsupported',?,'sector','Invented','Verified factual','Published','now','now')").run(records[0].slug);d.prepare("INSERT INTO signals(id,company_id,claim_id,category,description,first_observed,dedup_key,status) VALUES('bad',?,'unsupported','Engineering','Unsupported','now','bad','Verified')").run(records[0].slug);const s=d.prepare(SUMMARY_SQL).get();assert.equal(s.companies,1);assert.equal(s.signals,0);assert.equal(d.prepare(SECTORS_SQL).all().length,1);assert.ok(s.lastChecked);d.prepare("UPDATE companies SET first_observed=datetime('now','+1 day')").run();assert.equal(d.prepare(SUMMARY_SQL).get().recent,0);d.close();});

// Patch 1.2 audit: a citation whose evidence contradicts the claim cannot substantiate it.
test('screening requires an explicit supports relationship',()=>{
 for(const evidence of [[{source_id:'s1',relationship:'contradicts'}],[{source_id:'s1'}],[]]){
  const r=thesisFit({claims:[claim('sector','Software',{evidence})]},{sector:'Software',weights:{sector:100,stage:0,keywords:0,progress:0}});
  assert.equal(r.score,null);
  assert.equal(r.factors[0].reason,'No eligible source-backed claim');
 }
});
test('profile dimensions show sourced claims only, with precise funding types',()=>{
 assert.ok(Object.isFrozen(PROFILE_FIELDS));
 const sourced=(field,status='Published',relationship='supports')=>({id:field,field,value:'Reported value',status,classification:'Company-reported',evidence:[{source_id:'id',url:'https://example.org/record',relationship}]});
 const claims=[sourced(' Equity Funding '),sourced('grant'),sourced('founder'),sourced('revenue'),sourced('status'),sourced('stage'),sourced('equity funding','Rejected'),sourced('grant','Published','contradicts'),sourced('funding')];
 for(const [dimension,field] of [['equityFunding',' Equity Funding '],['grants','grant'],['founders','founder'],['traction','revenue'],['lifecycle','status'],['stage','stage']]){
  const found=supportedProfileClaims(claims,dimension);
  assert.equal(found.length,1);
  assert.equal(found[0].field,field);
 }
 assert.deepEqual(supportedProfileClaims([sourced('funding')],'equityFunding'),[]);
 assert.throws(()=>supportedProfileClaims(claims,'unrecognized'),/Unknown profile dimension/);
});
test('contradicting-only citations do not increase supported claim or sector summary totals',async()=>{
 const d=new DatabaseSync(':memory:');
 d.exec(readFileSync(new URL('../drizzle/0000_first_drax.sql',import.meta.url),'utf8'));
 const record=JSON.parse(readFileSync(new URL('../data/import.json',import.meta.url),'utf8'))[0];
 for(const op of await recordStatements(record))d.prepare(op.sql).run(...op.values);
 const sector=d.prepare("SELECT id FROM claims WHERE field='sector' LIMIT 1").get();
 assert.ok(sector,'seed fixture must have a sector');
 const before=d.prepare(SUMMARY_SQL).get();
 assert.equal(d.prepare(SECTORS_SQL).all().length,1);
 d.prepare("UPDATE evidence SET relationship='contradicts' WHERE claim_id=?").run(sector.id);
 const after=d.prepare(SUMMARY_SQL).get();
 assert.equal(after.claims,before.claims-1);
 assert.equal(d.prepare(SECTORS_SQL).all().length,0);
 d.close();
});
