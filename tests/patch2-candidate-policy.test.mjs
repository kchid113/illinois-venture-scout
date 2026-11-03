import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {candidateStatements,approvalStatements,CONNECTORS,normalizeCompanyName} from '../core/source-candidates.mjs';
import {publishedDate} from '../core/source-security.mjs';

const at='2026-11-03T12:00:00.000Z';
const valid={
 connector:'iventure-cohorts',externalId:'cohort-11:venture-one',
 sourceUrl:'https://iventure.illinois.edu/startups',
 publisher:'University of Illinois iVenture Accelerator',title:'Venture One — Cohort 11',
 excerpt:'iVenture Accelerator cohort 11 official record explicitly lists Venture One',
 companyName:'Venture One',companyId:'venture-one',eventDate:null,
 payload:{recordType:'iventure-cohort',cohort:11,ventureWebsite:'https://ventureone.example.org/'}
};
test('candidate observation and content ID are stable across refresh timestamps',async()=>{
 const one=await candidateStatements(valid,at),two=await candidateStatements(valid,'2026-11-04T12:00:00.000Z');
 assert.equal(one.id,two.id);
 assert.equal(one.values[10],at);
 assert.equal(two.values[10],'2026-11-04T12:00:00.000Z');
});
test('different real source revisions remain distinct candidates rather than overwriting an approved record',async()=>{
 const a=await candidateStatements(valid,at);
 const b=await candidateStatements({...valid,excerpt:valid.excerpt+' (updated listing)'},at);
 assert.notEqual(a.id,b.id);
});
for(const [name,patch] of [
 ['no source connector',{connector:'unknown'}],
 ['directory import cannot be staged as a claim',{connector:'research-park-1'}],
 ['Github release is a different import pathway',{connector:'github-releases'}],
 ['empty external ID',{externalId:''}],
 ['too long external ID',{externalId:'r'.repeat(260)}],
 ['missing publisher',{publisher:''}],
 ['oversized publisher',{publisher:'x'.repeat(400)}],
 ['missing title',{title:''}],
 ['oversized title',{title:'x'.repeat(400)}],
 ['missing excerpt',{excerpt:''}],
 ['oversized excerpt',{excerpt:'x'.repeat(1400)}],
 ['oversized company name',{companyName:'V'.repeat(450)}],
 ['missing company ID separator invalid',{companyId:'bad id'}],
 ['empty metadata object invalid',{payload:'not JSON object'}],
 ['oversized source payload',{payload:{data:'x'.repeat(10000)}}],
 ['invalid event date',{eventDate:'2026-02-31'}],
 ['invalid observation date',{}],
 ]){
 test('ingestion blocks malformed candidate: '+name,async()=>{
  const record={...valid,...patch};
  if(name==='invalid observation date')await assert.rejects(()=>candidateStatements(record,'2026-02-31'),/timestamp|observation/);
  else await assert.rejects(()=>candidateStatements(record,at),/Invalid|connector|source|timestamp|publisher|payload|candidate/i);
 });
}
test('publisher-origin identity and approval rules do not infer money or ownership from incubator presence',async()=>{
 const candidate={...valid,connector:'enterpriseworks-directory',sourceUrl:'https://researchpark.illinois.edu/category/tenant-directory/enterpriseworks-incubator/',
  externalId:'https://researchpark.illinois.edu/venture-one/',title:'Venture One — EnterpriseWorks',
  payload:JSON.stringify({recordType:'official-incubator-directory',profileUrl:'https://researchpark.illinois.edu/venture-one/',sourceCategories:['Tenant Directory','EnterpriseWorks Incubator']})};
 const stmt=await candidateStatements(candidate,at);
 const row={id:stmt.id,source_url:candidate.sourceUrl,title:candidate.title,publisher:candidate.publisher,
  status:'Pending',company_id:'venture-one',connector:candidate.connector,excerpt:candidate.excerpt,
  observed_at:at,event_date:null,content_hash:stmt.values[12],payload:candidate.payload};
 const ops=await approvalStatements(row,at);
 assert.ok(ops.some(x=>x.sql.includes('affiliations')));
 assert.ok(!ops.some(x=>x.sql.includes('signals')));
 assert.ok(!ops.some(x=>String(x.values).toLowerCase().includes('equity funding')));
});
test('only source-approved connectors are exposed by the refresh source registry',()=>{
 assert.equal(new Set(CONNECTORS).size,CONNECTORS.length);
 for(const key of CONNECTORS)assert.ok(/^[a-z0-9-]+$/.test(key));
});
test('calendar validation and company normalization never infer a business relationship',()=>{
 assert.equal(publishedDate('not published'),null);
 assert.equal(normalizeCompanyName('UIUC independent company'),'uiuc independent company');
 const readme=readFileSync(new URL('../README.md',import.meta.url),'utf8');
 assert.match(readme,/independent VC research tool/);
 assert.match(readme,/not.*promot/i);
});
