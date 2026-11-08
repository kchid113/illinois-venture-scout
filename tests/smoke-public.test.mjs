import test from 'node:test';
import assert from 'node:assert/strict';
import {probePublicResearch} from '../scripts/smoke-public.mjs';

const origin='https://illinois-venture-radar.vercel.app';
const claim={id:'claim-1',field:'sector',value:'AgTech',status:'Published',
  evidence:[{source_id:'source-1',relationship:'supports',url:'https://example.org/official'}]};
const company={id:'company-1',name:'Example Venture',claims:[claim]};
const fixtures={
 '/api/health':{status:'ready',companies:43,sources:8,supportedClaims:146},
 '/api/data?view=summary':{companies:43,sources:8,claims:146,jobs:[]},
 '/api/data?page=1':{total:43,companies:[company]},
 '/api/data?view=company&id=company-1':company,
 '/api/data?view=sources':[{url:'https://example.org/official'}]
};
function fakeFetch(overrides={}){
 const paths=[];
 const fetcher=async url=>{
  const path=new URL(url).pathname+new URL(url).search;
  paths.push(path);
  if(path==='/api/data?view=workspace')
   return new Response(JSON.stringify({error:'Forbidden'}),{status:403,headers:{'content-type':'application/json'}});
  const value=Object.hasOwn(overrides,path)?overrides[path]:fixtures[path];
  if(value instanceof Response)return value;
  if(value===undefined)throw Error('Unexpected request '+path);
  return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
 };
 return {paths,fetcher};
}
test('healthy populated deployment passes end-to-end API contract',async()=>{
 const {paths,fetcher}=fakeFetch();
 const result=await probePublicResearch(origin,fetcher);
 assert.equal(result.status,'passed');assert.equal(result.companies,43);
 assert.ok(paths.includes('/api/data?view=workspace'));
});
test('unavailable, protected, and non-JSON deployments fail loudly',async()=>{
 const unavailable=fakeFetch({'/api/health':new Response(JSON.stringify({status:'not-ready',reason:'database-unavailable'}),{status:503,headers:{'content-type':'application/json'}})});
 await assert.rejects(()=>probePublicResearch(origin,unavailable.fetcher),/HTTP 503/);
 const protectedSite=fakeFetch({'/api/health':new Response('<html>Sign in</html>',{status:200,headers:{'content-type':'text/html'}})});
 await assert.rejects(()=>probePublicResearch(origin,protectedSite.fetcher),/non-JSON/);
 const empty=fakeFetch({'/api/health':{status:'ready',companies:0,sources:0,supportedClaims:0}});
 await assert.rejects(()=>probePublicResearch(origin,empty.fetcher),/populated database/);
});
test('missing discovery records and provenance fail the release gate',async()=>{
 const empty=fakeFetch({'/api/data?page=1':{total:43,companies:[]}});
 await assert.rejects(()=>probePublicResearch(origin,empty.fetcher),/no records/);
 const noEvidence=fakeFetch({'/api/data?page=1':{total:43,companies:[{id:'company-1',claims:[]}]}});
 await assert.rejects(()=>probePublicResearch(origin,noEvidence.fetcher),/supporting evidence/);
});
test('private job data disclosure and accidental workspace access fail the release gate',async()=>{
 const jobs=fakeFetch({'/api/data?view=summary':{companies:43,claims:146,sources:8,jobs:[{secret:'internal'}]}});
 await assert.rejects(()=>probePublicResearch(origin,jobs.fetcher),/internal ingestion jobs/);
 const workspace=fakeFetch();
 const unprotected=async url=>url.includes('view=workspace')
  ?new Response('{}',{status:200}):workspace.fetcher(url);
 await assert.rejects(()=>probePublicResearch(origin,unprotected),/not explicitly denied/);
});
test('mismatched health and public metrics are rejected',async()=>{
 const drift=fakeFetch({'/api/data?view=summary':{companies:42,claims:146,sources:8,jobs:[]}});
 await assert.rejects(()=>probePublicResearch(origin,drift.fetcher),/totals differ/);
});
test('smoke tests do not accept arbitrary origin credentials or query strings',async()=>{
 for(const url of ['http://evil.example','https://foo.example',
 'https://user:pw@illinois-venture-radar.vercel.app/',
 'https://illinois-venture-radar.vercel.app/?access_token=secret',
 'http://169.254.169.254/','https://illinois-venture-radar.vercel.app/secret']){
  let calls=0;
  await assert.rejects(()=>probePublicResearch(url,async()=>{calls++;throw Error('unexpected request');}),/origin|Vercel|URL/i);
  assert.equal(calls,0);
 }
});
