import test from 'node:test';
import assert from 'node:assert/strict';
import {thesisFit,screeningSnapshot,csv,report,validCitations} from '../core/records.mjs';
import {DEFAULT_WEIGHTS,SCREENING_MIN_COVERAGE,METRICS,METHODOLOGY_VERSION,PROFILE_FIELDS,supportedProfileClaims} from '../core/methodology.mjs';
const claim=(field,value,other={})=>({id:field+':'+value,field,value,status:'Published',classification:'Verified factual',evidence:[{source_id:'source',url:'https://researchpark.illinois.edu/nova-labs/',relationship:'supports'}],...other});
const c=(...claims)=>({id:'nova-labs',name:'Nova Labs',updated_at:'2026-11-03T12:00:00Z',claims});
const criteria=(sector='Software',weights={sector:100,stage:0,keywords:0,progress:0})=>({sector,keywords:'',stage:'',weights});
test('screening registry and code agree on the numeric threshold',()=>{
 assert.equal(SCREENING_MIN_COVERAGE,50);
 assert.deepEqual(DEFAULT_WEIGHTS,{sector:35,stage:20,keywords:25,progress:20});
 assert.match(METRICS.thesis.rule,/50%/);
 assert.equal(METRICS.thesis.version,METHODOLOGY_VERSION);
});
for(const value of ['Software','software','Industrial Software','software · robotics']){
 test('sector criterion matches source-reported sector text '+value,()=>{
  const r=thesisFit(c(claim('sector',value)),criteria('software'));
  assert.equal(r.score,100);assert.equal(r.coverage,100);assert.equal(r.knownWeight,100);
 });
}
for(const field of ['description','funding','affiliation','website','founder','stage']){
 test('screening does not silently classify '+field+' text as a sector',()=>{
  const r=thesisFit(c(claim(field,'Software')),criteria('Software'));
  assert.equal(r.score,null);assert.equal(r.knownWeight,0);
 });
}
for(const klass of ['Analytical interpretation','Unverified','Analyst-assigned']){
 test('screening excludes unsupported origin '+klass,()=>{
  const r=thesisFit(c(claim('sector','Software',{classification:klass})),criteria());
  assert.equal(r.score,null);assert.equal(r.factors[0].known,false);
 });
}
for(const status of ['Pending','Rejected','Conflicting','Unverified']){
 test('screening never uses a '+status+' sector as a verified preference',()=>{
  const r=thesisFit(c(claim('sector','Software',{status})),criteria());
  assert.equal(r.score,null);
 });
}
for(const evidence of [[],[{source_id:'source',relationship:'contradicts'}],[{source_id:null,relationship:'supports'}],[{url:'https://researchpark.illinois.edu/nova/',relationship:'supports'}]]){
 test('evidence eligibility requires explicit supporting source identity '+JSON.stringify(evidence),()=>{
  assert.equal(thesisFit(c(claim('sector','Software',{evidence})),criteria()).score,null);
 });
}
test('one contradictory alternative cannot be cherry-picked into a sector score',()=>{
 const company=c(claim('sector','Software'),claim('sector','Hardware',{status:'Conflicting',id:'other'}));
 const result=thesisFit(company,criteria());
 assert.equal(result.score,null);
 assert.match(result.factors[0].reason,/Conflicting/);
});
test('a sourced known nonmatch receives zero fit, not unknown, when coverage meets threshold',()=>{
 const r=thesisFit(c(claim('sector','Agriculture')),criteria('Software'));
 assert.equal(r.coverage,100);assert.equal(r.score,0);assert.equal(r.factors[0].match,false);
});
test('explicitly zero weight disables matching without interpreting unknown as negative',()=>{
 const r=thesisFit(c(claim('sector','Agriculture')),criteria('Software',{sector:0,stage:0,keywords:0,progress:0}));
 assert.equal(r.score,null);assert.equal(r.factors[0].reason,'Disabled (zero weight)');
});
test('exactly the 50% coverage threshold yields a score, less than 50% withholds',()=>{
 const company=c(claim('sector','Software'));
 for(const [sector,stage,expected] of [[50,50,100],[49,51,null]]){
  const r=thesisFit(company,criteria('Software',{sector,stage,keywords:0,progress:0}));
  assert.equal(r.score,expected);assert.equal(r.totalWeight,100);
 }
});
for(const weight of [Infinity,-Infinity,NaN,-100,'abc']){
 test('malformed sector weight never generates NaN or fake authoritative score '+String(weight),()=>{
  const r=thesisFit(c(claim('sector','Software')),criteria('Software',{sector:weight,stage:0,keywords:0,progress:0}));
  assert.equal(r.score,null);assert.ok(Number.isFinite(r.coverage));
 });
}
test('large finite weight is clamped to documented 0..100 range',()=>{
 const r=thesisFit(c(claim('sector','Software')),criteria('Software',{sector:9999,stage:0,keywords:0,progress:0}));
 assert.equal(r.totalWeight,100);assert.equal(r.score,100);
});
test('keyword OR matching ignores empty comma-separated inputs',()=>{
 const r=thesisFit(c(claim('description','AI powered manufacturing',{classification:'Company-reported'})),
  {keywords:' , , AI ,',weights:{sector:0,stage:0,keywords:100,progress:0}});
 assert.equal(r.score,100);
});
test('screening snapshot contains the original calculation despite later source and weight edits',()=>{
 const original=c(claim('sector','Software'));const entered=criteria('Software');
 const snap=screeningSnapshot(original,entered,'2026-11-03T12:00:00.000Z');
 original.claims[0].value='Hardware';entered.sector='Biotech';entered.weights.sector=0;
 assert.equal(snap.result.score,100);
 assert.equal(thesisFit({claims:snap.claims},snap.criteria).score,100);
});
test('profile fields exclude missing citations and do not promote untyped funding to an equity round',()=>{
 const company=c(claim('funding','$1M')).claims;
 assert.equal(supportedProfileClaims(company,'equityFunding').length,0);
 const verified=claim('grant','$1M NIH award',{classification:'Company-reported'});
 assert.equal(supportedProfileClaims([verified],'grants').length,1);
 assert.equal(supportedProfileClaims([{...verified,evidence:[]}],'grants').length,0);
});
test('citation validation fails for unknown IDs and accepts known IDs only',()=>{
 assert.equal(validCitations(['unknown'],['trusted']),false);
 assert.equal(validCitations(['trusted'],['trusted']),true);
 assert.equal(validCitations(['trusted','unknown'],['trusted']),false);
});
test('CSV injection protection applies to leading tabs, newlines, spaces and Unicode separators',()=>{
 const values=['=HYPERLINK("https://evil.test")','+2+2','@SUM(1,1)','-4+4',' \t=HYPERLINK("https://evil.test")','\t@SUM(1,1)','\r\n+2+2','\ufeff=1+1'];
 const line=csv([values]);
 const escaped=line.split(',');
 for(const v of values)assert.ok(!line.includes('"'+v.replaceAll('"','""')+'"'),'Unprotected spreadsheet formula: '+JSON.stringify(v));
 assert.ok(line.includes("'=HYPERLINK"));
});
test('CSV preserves ordinary quoted text and newlines without changing their data',()=>{
 const out=csv([['Nova Labs','Says "Hello"','Notes\nsecond line','']]);
 assert.match(out,/"Nova Labs"/);assert.match(out,/"Says ""Hello"""/);
 assert.match(out,/Notes\nsecond line/);
 assert.ok(out.endsWith('""'));
});
test('report must not claim all financing is unavailable when there is a sourced grant',()=>{
 const company=c(claim('grant','NIH research award of $125,000',{classification:'Verified factual'}));
 const text=report(company);
 assert.ok(text.includes('NIH research award of $125,000'));
 assert.ok(!text.includes('No verified funding, revenue or valuation is recorded'));
});
test('report must not emit clickable dangerous source schemes from untrusted evidence',()=>{
 const company=c(claim('description','Testing',{evidence:[{source_id:'s1',relationship:'supports',url:'javascript:alert(1)',publisher:'Unknown',title:'Bogus',retrieved_at:'today',last_checked:'today'}]}));
 const text=report(company);
 assert.ok(!text.includes('(javascript:'));
});
