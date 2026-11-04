import test from 'node:test';
import assert from 'node:assert/strict';
import {provisionD1} from '../core/cloudflare-d1-provision.mjs';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const accountId='a'.repeat(32),token='fake-private-cloudflare-api-token';
const named={name:'illinois-venture-radar',uuid:'11111111-1111-4111-8111-111111111111'};
const unrelated={name:'another-worker-db',uuid:'22222222-2222-4222-8222-222222222222'};
const json=(result,status=200)=>new Response(JSON.stringify({success:true,result}),{status});
const inputs={accountId,token};
test('D1 selects an existing database by exact name without mutation',async()=>{
 const requests=[];
 const result=await provisionD1({...inputs,fetcher:async(url,options)=>{
  requests.push({url,options});
  return json([unrelated,named]);
 }});
 assert.deepEqual(result,{databaseId:named.uuid,created:false});
 assert.equal(requests.length,1);
 assert.match(requests[0].url,/\/accounts\/a{32}\/d1\/database\?name=illinois-venture-radar/);
 assert.equal(requests[0].options.method,'GET');
 assert.equal(requests[0].options.redirect,'error');
 assert.equal(requests[0].options.body,undefined);
 assert.equal(requests[0].options.headers.Authorization,'Bearer '+token);
});
test('D1 never creates missing database unless creation is explicitly authorized',async()=>{
 let calls=0;
 await assert.rejects(provisionD1({...inputs,fetcher:async()=>{calls++;return json([]);}}),/explicit creation/);
 assert.equal(calls,1);
});
test('D1 creation uses name-only body and never logs bearer credentials',async()=>{
 const verbs=[];
 const result=await provisionD1({...inputs,allowCreate:true,fetcher:async(_url,options)=>{
  verbs.push(options.method);
  if(options.method==='GET')return json([]);
  assert.deepEqual(JSON.parse(options.body),{name:'illinois-venture-radar'});
  return json(named);
 }});
 assert.deepEqual(result,{databaseId:named.uuid,created:true});
 assert.deepEqual(verbs,['GET','POST']);
 assert.ok(!JSON.stringify(result).includes(token));
});
test('D1 refuses ambiguous duplicate names instead of arbitrarily picking one',async()=>{
 await assert.rejects(provisionD1({...inputs,fetcher:async()=>json([named,{...named,uuid:'33333333-3333-4333-8333-333333333333'}])}),/Ambiguous Cloudflare D1/);
});
test('D1 refuses returned database that does not match the requested name',async()=>{
 await assert.rejects(provisionD1({...inputs,allowCreate:true,fetcher:async(_url,opts)=>opts.method==='GET'?json([]):json(unrelated)}),/provisioning failed/);
});
for(const status of [301,401,403,429,500]){
 test('D1 API errors are masked and fail closed: HTTP '+status,async()=>{
  await assert.rejects(provisionD1({...inputs,fetcher:async()=>new Response('secret:'+token,{status})}),
    e=>!e.message.includes(token)&&/authorization or provisioning failed/.test(e.message));
 });
}
test('D1 transport errors cannot leak URLs or bearer tokens',async()=>{
 await assert.rejects(provisionD1({...inputs,fetcher:async()=>{throw Error('Bearer '+token);}}),
  e=>!e.message.includes(token));
});
for(const value of [null,{},'oops',[],{success:false,result:[]},{success:true,result:{foo:'bar'}}]){
 test('D1 rejects malformed account responses without mutating resources',async()=>{
  let calls=0;
  await assert.rejects(provisionD1({...inputs,fetcher:async()=>{
   calls++;return new Response(JSON.stringify(value));
  }}));
  assert.equal(calls,1);
 });
}
test('D1 rejects invalid account IDs and credentials before making any request',async()=>{
 let calls=0;
 for(const change of [{accountId:'bad'},{accountId:'0'.repeat(33)},{token:'short'},{token:''}]){
  await assert.rejects(provisionD1({...inputs,...change,fetcher:async()=>{
   calls++;return json([]);
  }}));
 }
 assert.equal(calls,0);
});
test('GitHub Cloudflare deploy preflight rejects absent or invalid Access settings without leaking secrets',()=>{
 const bad={...process.env,CLOUDFLARE_ACCOUNT_ID:accountId,CLOUDFLARE_API_TOKEN:token,
 IVR_ACCESS_TEAM_DOMAIN:'http://not-allowed',IVR_ACCESS_AUD:'',IVR_ADMIN_EMAIL:''};
 const result=spawnSync(process.execPath,['scripts/cloudflare-deploy-preflight.mjs'],{
  cwd:process.cwd(),env:bad,encoding:'utf8',timeout:10000
 });
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/Access/);
 assert.ok(!result.stderr.includes(token));
});
test('GitHub Cloudflare deploy preflight accepts safe placeholders without contacting provider',()=>{
 const good={...process.env,CLOUDFLARE_ACCOUNT_ID:accountId,CLOUDFLARE_API_TOKEN:token,
 IVR_ACCESS_TEAM_DOMAIN:'https://example-student.cloudflareaccess.com',
 IVR_ACCESS_AUD:'venture-app-audience-123',IVR_ADMIN_EMAIL:'admin@example.edu'};
 const result=spawnSync(process.execPath,['scripts/cloudflare-deploy-preflight.mjs'],{
  cwd:process.cwd(),env:good,encoding:'utf8',timeout:10000
 });
 assert.equal(result.status,0,result.stderr);
 assert.ok(!result.stdout.includes(token));
});
test('GitHub workflow is manual main-only and never exports provider secrets to PR test jobs',()=>{
 const yml=readFileSync(new URL('../.github/workflows/cloudflare-deploy.yml',import.meta.url),'utf8');
 assert.match(yml,/workflow_dispatch/);
 assert.doesNotMatch(yml,/\n\s+pull_request:/);
 assert.match(yml,/github\.ref == 'refs\/heads\/main'/);
 assert.match(yml,/secrets\.CLOUDFLARE_API_TOKEN/);
 assert.match(yml,/vars\.CLOUDFLARE_ACCOUNT_ID/);
 assert.match(yml,/vars\.IVR_ACCESS_TEAM_DOMAIN/);
 assert.match(yml,/vars\.IVR_ACCESS_AUD/);
 assert.match(yml,/pnpm install --frozen-lockfile/);
 assert.match(yml,/pnpm exec vite build --config vite\.cloudflare\.config\.ts/);
 assert.match(yml,/wrangler d1 migrations apply DB --remote/);
 assert.match(yml,/steps\.database\.outputs\.created == 'true'/);
});
