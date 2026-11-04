import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const secretJobs=[
 ['.github/workflows/education-pack-readiness.yml',[
  'secrets.IVR_HONEYBADGER_CHECKIN_URL','secrets.IVR_BROWSERSTACK_USERNAME',
  'secrets.IVR_BROWSERSTACK_ACCESS_KEY','secrets.CODECOV_TOKEN'
 ]],
 ['.github/workflows/codecov-test-analytics.yml',['secrets.CODECOV_TOKEN']],
 ['.github/workflows/browserstack-mobile-smoke.yml',[
  'secrets.IVR_BROWSERSTACK_USERNAME','secrets.IVR_BROWSERSTACK_ACCESS_KEY'
 ]],
 ['.github/workflows/refresh-public-sources.yml',[
  'secrets.IVR_ADMIN_TOKEN','secrets.IVR_HONEYBADGER_CHECKIN_URL',
  'secrets.IVR_SITES_SERVICE_TOKEN'
 ]]
];
const PERMISSIONS=/permissions:\s*\n\s*contents: read\b/;
const MAIN_GUARD=/if:\s*\$\{\{\s*github\.ref == 'refs\/heads\/main'/;
test('readiness is explicitly dispatched only; no Dependabot/fork/same-repo PR secret exposure',()=>{
 const wf=file('.github/workflows/education-pack-readiness.yml');
 assert.match(wf,/workflow_dispatch:/);
 assert.doesNotMatch(wf,/\n\s+pull_request:/);
 assert.match(wf,MAIN_GUARD);
 assert.doesNotMatch(wf,/github\.event\.pull_request\.head\.repo\.full_name/);
});
for(const [path,secrets] of secretJobs){
 test('credential-bearing job is main-only, least-privilege and keeps secrets out of shell commands: '+path,()=>{
  const content=file(path);
  assert.match(content,PERMISSIONS);
  assert.match(content,MAIN_GUARD);
  for(const secret of secrets)assert.ok(content.includes(secret),secret);
  assert.doesNotMatch(content,/permissions:\s*\n\s*contents: write/);
  assert.doesNotMatch(content,/run:\s*(?:\||>)?[\s\S]*?echo\s+["']?\$\{\{\s*secrets\./);
 });
}
test('browser/mobile smoke stays manual and does not run on a scheduled or PR event',()=>{
 const wf=file('.github/workflows/browserstack-mobile-smoke.yml');
 assert.match(wf,/workflow_dispatch:/);
 assert.doesNotMatch(wf,/\n\s+pull_request:/);
 assert.doesNotMatch(wf,/\n\s+schedule:/);
 assert.match(wf,/vars\.IVR_BROWSERSTACK_ENABLED == 'true'/);
});
test('source refresh stays off until explicitly enabled and never runs from a non-default branch',()=>{
 const wf=file('.github/workflows/refresh-public-sources.yml');
 assert.match(wf,/vars\.IVR_AUTOMATION_ENABLED == 'true'/);
 assert.match(wf,/cron: '17 10 \* \* \*'/);
 assert.match(wf,/cancel-in-progress: false/);
 assert.match(wf,MAIN_GUARD);
 assert.doesNotMatch(wf,/\n\s+pull_request:/);
});
test('Codecov accepts only manually selected/main-push jobs and retains real JUnit reporting',()=>{
 const wf=file('.github/workflows/codecov-test-analytics.yml');
 assert.match(wf,/workflow_dispatch:/);
 assert.match(wf,/push:/);
 assert.match(wf,/\s+- main\b/);
 assert.match(wf,MAIN_GUARD);
 assert.match(wf,/node --test --test-reporter=junit/);
 assert.match(wf,/report_type: test_results/);
 assert.match(wf,/fail_ci_if_error: true/);
});
test('ordinary verify workflow must use zero repository API/monitoring secrets',()=>{
 const wf=file('.github/workflows/verify-methodology.yml');
 assert.match(wf,/\n\s+pull_request:/);
 assert.doesNotMatch(wf,/\$\{\{\s*secrets\./);
 assert.match(wf,/pnpm typecheck/);
 assert.match(wf,/pnpm lint/);
 assert.match(wf,/pnpm build/);
 assert.match(wf,/node --experimental-test-coverage --test tests\/\*\.test\.mjs/);
});
test('public analytics is explicitly disabled unless production flag is set',()=>{
 const layout=file('app/layout.tsx');
 assert.match(layout,/IVR_SIMPLE_ANALYTICS_ENABLED==='true'/);
 assert.match(layout,/NODE_ENV==='production'/);
 assert.doesNotMatch(layout,/scripts\.simpleanalyticscdn\.com\/latest\.js/);
});
test('provider readiness script needs secrets; never emits fake Honeybadger check-in',()=>{
 const r=spawnSync(process.execPath,['scripts/education-readiness.mjs'],{
  env:{
   ...process.env,IVR_HONEYBADGER_CHECKIN_URL:'',
   IVR_BROWSERSTACK_USERNAME:'',IVR_BROWSERSTACK_ACCESS_KEY:'',CODECOV_TOKEN:''
  },encoding:'utf8',timeout:10000
 });
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/GitHub Actions Secrets missing/);
 assert.ok(!r.stdout.includes('Scheduled refresh heartbeat acknowledged'));
 assert.ok(!r.stdout.includes('BrowserStack: authenticated'));
});
