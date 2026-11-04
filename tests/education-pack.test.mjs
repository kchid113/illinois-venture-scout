import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {honeybadgerCheckinUrl,reportHoneybadgerSuccess} from '../core/education-monitoring.mjs';
import {browserstackConfig,browserstackCapabilities,runBrowserstackSmoke} from '../core/education-browserstack.mjs';
import {publicAnalyticsPath} from '../core/analytics-policy.mjs';
import {browserstackCredentials,verifyBrowserstackPlan} from '../core/education-browserstack.mjs';

const good='https://api.honeybadger.io/v1/check_in/testCaseABCD1234';
const eu='https://eu-api.honeybadger.io/v1/check_in/hbp_ABCxyz1234/daily-refresh';
const config={
 IVR_BROWSERSTACK_USERNAME:'student-account',
 IVR_BROWSERSTACK_ACCESS_KEY:'mock-key-long-enough',
 IVR_BROWSERSTACK_SITE_URL:'https://venture.example.org/',
 GITHUB_SHA:'a'.repeat(40)
};
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Honeybadger supports official US and EU check-in URLs',()=>{
 assert.equal(honeybadgerCheckinUrl(good),good);
 assert.equal(honeybadgerCheckinUrl(eu),eu);
});
for(const input of [
 '',undefined,'http://api.honeybadger.io/v1/check_in/token',
 'https://api.honeybadger.io.evil.test/v1/check_in/token',
 'https://user:pass@api.honeybadger.io/v1/check_in/token',
 'https://api.honeybadger.io/v1/check_in/token?redirect=1',
 'https://api.honeybadger.io/v1/check_in/token#fragment',
 'https://api.honeybadger.io:444/v1/check_in/token',
 'https://api.honeybadger.io/admin/checkin/token',
 'https://api.honeybadger.io/v1/check_in/../admin',
 'https://localhost/v1/check_in/token','javascript:alert(1)'
]){
 test('Honeybadger refuses untrusted destination '+String(input),()=>{
  assert.throws(()=>honeybadgerCheckinUrl(input),/Honeybadger/);
 });
}
test('Honeybadger without a check-in URL does nothing and issues zero requests',async()=>{
 let calls=0;
 assert.deepEqual(await reportHoneybadgerSuccess('',{fetcher:async()=>{calls++;throw Error('Unexpected fetch');}}),
  {configured:false,reported:false});
 assert.equal(calls,0);
});
test('Honeybadger sends exactly one empty GET with no referrer, headers or company data',async()=>{
 const calls=[];
 const res=await reportHoneybadgerSuccess(good,{fetcher:async(url,options)=>{
  calls.push({url,options});
  return new Response('ok',{status:200});
 }});
 assert.deepEqual(res,{configured:true,reported:true});
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,good);
 assert.equal(calls[0].options.method,'GET');
 assert.equal(calls[0].options.redirect,'error');
 assert.equal(calls[0].options.body,undefined);
 assert.equal(calls[0].options.headers,undefined);
});
for(const status of [302,401,429,500]){
 test('Honeybadger remote failure '+status+' is generic and does not leak the credential',async()=>{
  const mock=async()=>new Response('',{status,headers:status===302?{Location:'https://evil.test'}:{}});
  await assert.rejects(()=>reportHoneybadgerSuccess(good,{fetcher:mock}),e=>
   e.message.includes('check-in rejected')&&!e.message.includes('testCaseABCD1234'));
 });
}
test('Honeybadger transport errors cannot leak the credential even when thrown by fetch',async()=>{
 await assert.rejects(()=>reportHoneybadgerSuccess(good,{
  fetcher:async()=>{throw Error('REQUEST TO '+good);}
 }),e=>e.message==='Honeybadger check-in request failed');
});
test('BrowserStack configuration validates private-site HTTPS origin and never embeds credentials in capabilities',()=>{
 const c=browserstackConfig(config),caps=browserstackCapabilities(c);
 assert.equal(c.target,'https://venture.example.org/');
 assert.equal(c.device,'Samsung Galaxy S20');
 assert.equal(caps.alwaysMatch.browserName,'Chrome');
 assert.equal(caps.alwaysMatch['bstack:options'].realMobile,'true');
 assert.ok(!JSON.stringify(caps).includes(config.IVR_BROWSERSTACK_ACCESS_KEY));
 assert.ok(!JSON.stringify(caps).includes(config.IVR_BROWSERSTACK_USERNAME));
});
for(const patch of [
 {IVR_BROWSERSTACK_USERNAME:''},{IVR_BROWSERSTACK_ACCESS_KEY:''},
 {IVR_BROWSERSTACK_ACCESS_KEY:'short'},
 {IVR_BROWSERSTACK_SITE_URL:'http://venture.example.org/'},
 {IVR_BROWSERSTACK_SITE_URL:'https://localhost/'},
 {IVR_BROWSERSTACK_SITE_URL:'https://127.0.0.1/'},
 {IVR_BROWSERSTACK_SITE_URL:'https://venture.example.org/private'},
 {IVR_BROWSERSTACK_SITE_URL:'https://venture.example.org/?token=secret'},
 {IVR_BROWSERSTACK_SITE_URL:'https://user:pass@venture.example.org/'},
 {IVR_BROWSERSTACK_DEVICE:'Device\nAuthorization: Secret'},
 {IVR_BROWSERSTACK_OS_VERSION:'latest' }
]){
 test('BrowserStack blocks unsafe configuration '+JSON.stringify(patch),()=>{
  assert.throws(()=>browserstackConfig({...config,...patch}),/BrowserStack/);
 });
}
function fakeWebdriver({failAt=null,invalidState=false,status=503}={}){
 const calls=[];
 const fetcher=async(url,options)=>{
  const path=new URL(url).pathname;
  calls.push({path,options});
  if(failAt&&path.endsWith(failAt))return new Response('server error',{status});
  if(path.endsWith('/session'))return new Response(JSON.stringify({value:{sessionId:'session_ABC_123'}}));
  if(path.endsWith('/execute/sync'))return new Response(JSON.stringify({
   value:{ready:'complete',body:true,validEntry:!invalidState}
  }));
  return new Response(JSON.stringify({value:null}));
 };
 return {calls,fetcher};
}
test('BrowserStack runs W3C mobile navigation, validates entry and always deletes the remote session',async()=>{
 const c=browserstackConfig(config),mock=fakeWebdriver();
 const res=await runBrowserstackSmoke(c,{fetcher:mock.fetcher});
 assert.deepEqual(res,{ok:true,checked:'public-entry'});
 assert.deepEqual(mock.calls.map(x=>x.path),[
  '/wd/hub/session','/wd/hub/session/session_ABC_123/url',
  '/wd/hub/session/session_ABC_123/execute/sync',
  '/wd/hub/session/session_ABC_123'
 ]);
 assert.deepEqual(mock.calls.map(x=>x.options.method),['POST','POST','POST','DELETE']);
 for(const call of mock.calls){
  assert.equal(call.options.redirect,'error');
  assert.ok(call.options.headers.Authorization.startsWith('Basic '));
  assert.ok(!call.path.includes(config.IVR_BROWSERSTACK_ACCESS_KEY));
 }
 assert.equal(JSON.parse(mock.calls[1].options.body).url,'https://venture.example.org/');
});
test('BrowserStack cleans up the session when a real page does not load correctly',async()=>{
 const mock=fakeWebdriver({invalidState:true});
 await assert.rejects(()=>runBrowserstackSmoke(browserstackConfig(config),{fetcher:mock.fetcher}),/public entry\/sign-in smoke failed/);
 assert.equal(mock.calls.at(-1).options.method,'DELETE');
});
test('BrowserStack cleans up the session when navigation fails',async()=>{
 const mock=fakeWebdriver({failAt:'/url'});
 await assert.rejects(()=>runBrowserstackSmoke(browserstackConfig(config),{fetcher:mock.fetcher}),/HTTP 503/);
 assert.equal(mock.calls.at(-1).options.method,'DELETE');
});
test('BrowserStack invalid credentials/response do not reveal keys or leave fake success',async()=>{
 const c=browserstackConfig(config);
 await assert.rejects(()=>runBrowserstackSmoke(c,{fetcher:async()=>new Response('no',{status:401})}),
  e=>e.message.includes('HTTP 401')&&!e.message.includes(c.accessKey));
});
test('BrowserStack smoke CLI is safe to run with no credentials and is disabled by default',()=>{
 const r=spawnSync(process.execPath,['scripts/browserstack-smoke.mjs'],{
  env:{...process.env,IVR_BROWSERSTACK_ENABLED:'false',IVR_BROWSERSTACK_ACCESS_KEY:'',IVR_BROWSERSTACK_USERNAME:''},
  encoding:'utf8',timeout:10000
 });
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/disabled/);
});
test('BrowserStack enabled without credentials fails before any remote request',()=>{
 const r=spawnSync(process.execPath,['scripts/browserstack-smoke.mjs'],{
  env:{...process.env,IVR_BROWSERSTACK_ENABLED:'true',IVR_BROWSERSTACK_ACCESS_KEY:'',IVR_BROWSERSTACK_USERNAME:''},
  encoding:'utf8',timeout:10000
 });
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/username\/access key/);
});
test('Simple Analytics is operator opt-in and only sends explicit safe pageviews',()=>{
 const layout=read('app/layout.tsx'),client=read('components/education-analytics.tsx');
 assert.match(layout,/IVR_SIMPLE_ANALYTICS_ENABLED==='true'/);
 assert.match(layout,/NODE_ENV==='production'/);
 assert.match(client,/data-auto-collect="false"/);
 assert.match(client,/data-collect-dnt="false"/);
 assert.match(client,/data-ignore-metrics="referrer,utm,session/);
 assert.match(client,/publicAnalyticsPath\(pathname\)/);
 assert.match(client,/window\.sa_pageview\(safePath\)/);
 assert.ok(!client.includes('window.location.pathname'));
 assert.ok(!layout.includes('user.email'));
 assert.ok(!layout.includes('userId'));
});
test('Simple Analytics tracking strictly excludes unapproved and private paths',()=>{
 for(const path of ['/','/overview','/discover','/activity','/sources','/methodology'])
  assert.equal(typeof publicAnalyticsPath(path),'string');
 for(const path of [
  '/companies/secret-company','/research','/settings','/watchlists','/api/private?user=abc',
  '/user/alice@example.com','/funding/1234','/discover/secret','/compare',
  '/discover?search=private','/overview/#sensitive','/methodology?trace=123',null,undefined,{},1
 ])assert.equal(publicAnalyticsPath(path),null);
 assert.equal(publicAnalyticsPath('/'),'/overview');
});
test('Codecov and BrowserStack workflows require explicit opt-in and use GitHub Secrets',()=>{
 const codecov=read('.github/workflows/codecov-test-analytics.yml'),
  browser=read('.github/workflows/browserstack-mobile-smoke.yml');
 assert.match(codecov,/vars\.IVR_CODECOV_ENABLED == 'true'/);
 assert.match(codecov,/secrets\.CODECOV_TOKEN/);
 assert.match(codecov,/codecov\/codecov-action@v5/);
 assert.match(codecov,/report_type: test_results/);
 assert.match(browser,/vars\.IVR_BROWSERSTACK_ENABLED == 'true'/);
 assert.match(browser,/secrets\.IVR_BROWSERSTACK_ACCESS_KEY/);
 assert.match(browser,/secrets\.IVR_BROWSERSTACK_USERNAME/);
 assert.ok(!browser.includes('mock-key-long-enough'));
});
test('GitHub Codespaces and Dependabot require no API keys and preserve Node/pnpm versions',()=>{
 const dev=JSON.parse(read('.devcontainer/devcontainer.json'));
 assert.match(dev.image,/node:1-22/);
 assert.match(dev.postCreateCommand,/pnpm@11\.25\.0/);
 assert.match(dev.postCreateCommand,/--frozen-lockfile/);
 const dependabot=read('.github/dependabot.yml');
 assert.match(dependabot,/package-ecosystem: npm/);
 assert.match(dependabot,/package-ecosystem: github-actions/);
 assert.ok(!dependabot.includes('api-key'));
});
