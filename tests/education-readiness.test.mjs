import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {browserstackCredentials,verifyBrowserstackPlan} from '../core/education-browserstack.mjs';
import {validateEducationSecrets,verifyEducationReadiness} from '../core/education-readiness.mjs';
import {publicAnalyticsPath} from '../core/analytics-policy.mjs';

const creds={
 IVR_BROWSERSTACK_USERNAME:'student-test',
 IVR_BROWSERSTACK_ACCESS_KEY:'mock_secret_long_enough',
 IVR_HONEYBADGER_CHECKIN_URL:'https://api.honeybadger.io/v1/check_in/abc123',
 CODECOV_TOKEN:'12345678-1234-1234-1234-123456789abc'
};
const plan={automate_plan:'Automate Mobile',parallel_sessions_max_allowed:1,parallel_sessions_running:0};
const repoFile=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ok=async()=>new Response(JSON.stringify(plan),{status:200});

test('all four GitHub Secrets are shape-validated but never returned',()=>{
 const result=validateEducationSecrets(creds);
 assert.ok(Object.keys(result).includes('honeybadger'));
 assert.ok(Object.keys(result).includes('browserstack'));
 assert.ok(Object.keys(result).includes('codecov'));
 const serialized=JSON.stringify(result);
 for(const value of Object.values(creds))assert.ok(!serialized.includes(value));
});
test('missing GitHub Actions Secrets are listed by name only, never by value',()=>{
 const env={IVR_BROWSERSTACK_USERNAME:creds.IVR_BROWSERSTACK_USERNAME};
 assert.throws(()=>validateEducationSecrets(env),e=>
  e.message.includes('CODECOV_TOKEN')&&e.message.includes('IVR_HONEYBADGER_CHECKIN_URL')&&!e.message.includes(creds.IVR_BROWSERSTACK_USERNAME));
});
for(const invalid of [
 'http://api.honeybadger.io/v1/check_in/abc123',
 'https://api.honeybadger.io/v1/check_in/abc123;',
 'https://api.honeybadger.io/v1/check_in/abc123 ',
 'https://api.honeybadger.io.evil.test/v1/check_in/abc123',
 'https://user:pass@api.honeybadger.io/v1/check_in/abc123'
]){
 test('invalid Honeybadger check-in Secret is rejected with a masked error',()=>{
  assert.throws(()=>validateEducationSecrets({...creds,IVR_HONEYBADGER_CHECKIN_URL:invalid}),e=>
   e.message.includes('Honeybadger check-in')&&!e.message.includes('abc123'));
 });
}
for(const value of ['',null,'short','abc!12345#', 'a'.repeat(500)]){
 test('invalid Codecov token shape is rejected without echoing the token',()=>{
  assert.throws(()=>validateEducationSecrets({...creds,CODECOV_TOKEN:value}),e=>
   e.message.includes('CODECOV_TOKEN')&&(!value||!e.message.includes(String(value))));
 });
}
test('read-only BrowserStack plan endpoint uses HTTP Basic Auth with exactly one request',async()=>{
 const seen=[];
 const result=await verifyBrowserstackPlan(browserstackCredentials(creds),{
  fetcher:async(url,options)=>{seen.push({url,options});return ok();}
 });
 assert.equal(result.verified,true);
 assert.equal(result.plan,'Automate Mobile');
 assert.equal(result.parallelSessionsMax,1);
 assert.equal(seen.length,1);
 assert.equal(seen[0].url,'https://api.browserstack.com/automate/plan.json');
 assert.equal(seen[0].options.method,'GET');
 assert.equal(seen[0].options.redirect,'error');
 assert.equal(seen[0].options.body,undefined);
 assert.equal(seen[0].options.headers.Accept,'application/json');
 assert.equal(Buffer.from(seen[0].options.headers.Authorization.slice(6),'base64').toString('utf8'),
  creds.IVR_BROWSERSTACK_USERNAME+':'+creds.IVR_BROWSERSTACK_ACCESS_KEY);
});
for(const status of [302,400,401,403,429,502]){
 test('BrowserStack auth errors '+status+' are non-sensitive and fail closed',async()=>{
  await assert.rejects(()=>verifyBrowserstackPlan(browserstackCredentials(creds),{
   fetcher:async()=>new Response('',{status})
  }),e=>e.message.includes('HTTP '+status)&&!e.message.includes(creds.IVR_BROWSERSTACK_ACCESS_KEY));
 });
}
for(const payload of [
 'not-json','{}','[]',JSON.stringify({automate_plan:null,parallel_sessions_max_allowed:1}),
 JSON.stringify({automate_plan:'Automate Mobile',parallel_sessions_max_allowed:'invalid'}),
 JSON.stringify({automate_plan:'Automate Mobile'})
]){
 test('malformed BrowserStack plan response is never treated as a connected account',async()=>{
  await assert.rejects(()=>verifyBrowserstackPlan(browserstackCredentials(creds),{
   fetcher:async()=>new Response(payload)
  }),/invalid JSON|unexpected Automate plan/);
 });
}
for(const planValue of [
 {automate_plan:'Free',parallel_sessions_max_allowed:1},
 {automate_plan:'Automate',parallel_sessions_max_allowed:1},
 {automate_plan:'Automate Mobile',parallel_sessions_max_allowed:0},
 {automate_plan:'Automate Mobile',parallel_sessions_max_allowed:-2}
]){
 test('BrowserStack needs real Automate Mobile entitlement and positive parallel capacity',async()=>{
  await assert.rejects(()=>verifyBrowserstackPlan(browserstackCredentials(creds),{
   fetcher:async()=>new Response(JSON.stringify(planValue))
  }),/Automate Mobile plan or capacity/);
 });
}
test('BrowserStack transport exceptions do not surface credentials',async()=>{
 await assert.rejects(()=>verifyBrowserstackPlan(browserstackCredentials(creds),{
  fetcher:async()=>{throw Error(creds.IVR_BROWSERSTACK_ACCESS_KEY);}
 }),e=>e.message==='BrowserStack plan verification transport failed');
});
test('combined readiness never triggers a Honeybadger heartbeat or browser session',async()=>{
 let calls=0;
 const result=await verifyEducationReadiness(creds,{
  fetcher:async url=>{calls++;assert.equal(url,'https://api.browserstack.com/automate/plan.json');return ok();}
 });
 assert.equal(calls,1);
 assert.equal(result.browserstack.verified,true);
 assert.ok(!JSON.stringify(result).includes(creds.CODECOV_TOKEN));
 assert.ok(!JSON.stringify(result).includes(creds.IVR_HONEYBADGER_CHECKIN_URL));
});
test('readiness script can be exercised offline with injected fetch without secrets leaking',()=>{
 const r=spawnSync(process.execPath,[
  '--import','./tests/fixtures/mock-education-readiness-fetch.mjs','scripts/education-readiness.mjs'
 ],{cwd:process.cwd(),encoding:'utf8',timeout:10000,env:{...process.env,...creds}});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/BrowserStack: authenticated/);
 assert.match(r.stdout,/Honeybadger: configured/);
 assert.match(r.stdout,/Codecov: upload token configured/);
 for(const value of Object.values(creds)){
  assert.ok(!r.stdout.includes(value));
  assert.ok(!r.stderr.includes(value));
 }
});
test('readiness script fails without configured secrets before contacting providers',()=>{
 const r=spawnSync(process.execPath,[
  '--import','./tests/fixtures/mock-education-readiness-fetch.mjs','scripts/education-readiness.mjs'
 ],{cwd:process.cwd(),encoding:'utf8',timeout:10000,env:{
  ...process.env,IVR_HONEYBADGER_CHECKIN_URL:'',IVR_BROWSERSTACK_ACCESS_KEY:'',
  IVR_BROWSERSTACK_USERNAME:'',CODECOV_TOKEN:''
 }});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/GitHub Actions Secrets missing/);
});
test('Simple Analytics policy excludes raw company names, UTM parameters, notes and IDs',()=>{
 const allow=['/','/overview','/discover','/activity','/sources','/methodology'];
 for(const path of allow)assert.match(publicAnalyticsPath(path),/^\/[a-z]+$/);
 for(const path of [
  '/discover?fund=Private','/methodology?user=abc','/companies/archean-sciences',
  '/sources/verified-claim/123','/compare','/watchlists','/research',
  '/settings','/api/data','/signin-with-chatgpt',
  '/discover/private','/discover/','//discover','/%64iscover',
  null,undefined,'',1,{},['/discover']
 ])assert.equal(publicAnalyticsPath(path),null);
});
test('Simple Analytics script is manual-only with no query/referrer/session dimensions',()=>{
 const client=repoFile('components/education-analytics.tsx');
 for(const setting of [
  'data-auto-collect="false"','data-collect-dnt="false"',
  'data-ignore-metrics="referrer,utm,session,timeonpage,scrolled,useragent,screensize,viewportsize,language,querykeys"',
  'window.sa_pageview(safePath)','if(!safePath)return null;'
 ])assert.ok(client.includes(setting),setting);
 assert.ok(!client.includes('sa_pageview(window.location.pathname)'));
 assert.ok(!client.includes('data-path-overwriter'));
 assert.ok(!repoFile('app/layout.tsx').includes('scripts.simpleanalyticscdn.com'));
});
test('Codecov workflow uses verified action v5 inputs and uploads on main pushes',()=>{
 const wf=repoFile('.github/workflows/codecov-test-analytics.yml');
 assert.match(wf,/report_type: test_results/);
 assert.ok(!wf.includes('report-type: test_results'));
 assert.match(wf,/fail_ci_if_error: true/);
 assert.match(wf,/secrets\.CODECOV_TOKEN/);
 assert.match(wf,/branches:/);
 assert.match(wf,/\- main/);
});
test('education readiness workflow is restricted to trusted PRs and never sends a Honeybadger check-in',()=>{
 const wf=repoFile('.github/workflows/education-pack-readiness.yml');
 assert.match(wf,/github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
 assert.match(wf,/scripts\/education-readiness\.mjs/);
 assert.match(wf,/secrets\.IVR_HONEYBADGER_CHECKIN_URL/);
 assert.match(wf,/report_type: test_results/);
 assert.ok(!wf.includes('scripts/refresh-site.mjs'));
});
