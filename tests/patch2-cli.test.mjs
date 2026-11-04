import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {SOURCE_REFRESH_ORDER} from '../core/refresh-schedule.mjs';

const secret='test-token-must-never-leak-'+('Q'.repeat(40));
const base={
 IVR_AUTOMATION_ENABLED:'true',IVR_SITE_URL:'https://venture.example.org/',
 IVR_ADMIN_TOKEN:secret,IVR_SITES_SERVICE_TOKEN:'service-credential',
 IVR_TEST_EXPECT_SERVICE_TOKEN:'service-credential'
};
function invoke(extra={}){
 const env={...process.env,...base,...extra};
 return spawnSync(process.execPath,['--import','./tests/fixtures/mock-refresh-fetch.mjs','scripts/refresh-site.mjs'],{
  env,cwd:process.cwd(),encoding:'utf8',timeout:10000
 });
}
test('manual refresh sends exactly one authenticated POST for a named approved source',()=>{
 const r=invoke({IVR_CONNECTOR:'iventure-cohorts'});
 assert.equal(r.status,0,r.stderr);
 assert.deepEqual([...r.stdout.matchAll(/MOCK_REFRESH (\{[^\n]+\})/g)].map(x=>JSON.parse(x[1]).connector),['iventure-cohorts']);
 assert.match(r.stdout,/observed=3 imported=1 staged=2/);
 assert.ok(!r.stdout.includes(secret));
 assert.ok(!r.stderr.includes(secret));
});
test('manually selecting all refreshes every registered source exactly once',()=>{
 const r=invoke({IVR_CONNECTOR:'all'});
 assert.equal(r.status,0,r.stderr);
 const found=[...r.stdout.matchAll(/MOCK_REFRESH (\{[^\n]+\})/g)].map(x=>JSON.parse(x[1]).connector);
 assert.deepEqual(found,[...SOURCE_REFRESH_ORDER]);
 assert.equal(new Set(found).size,found.length);
});
test('one unavailable provider causes a visible failed job but no skipped remaining source requests',()=>{
 const r=invoke({IVR_CONNECTOR:'all',IVR_TEST_FAIL_CONNECTOR:'iventure-cohorts'});
 assert.notEqual(r.status,0);
 const found=[...r.stdout.matchAll(/MOCK_REFRESH (\{[^\n]+\})/g)].map(x=>JSON.parse(x[1]).connector);
 assert.deepEqual(found,[...SOURCE_REFRESH_ORDER]);
 assert.match(r.stderr,/iventure-cohorts: HTTP 503/);
 assert.ok(r.stderr.includes(`1/${SOURCE_REFRESH_ORDER.length} refresh connector(s) failed`));
 assert.ok(!r.stderr.includes(secret));
});
test('the CLI rejects unsupported requested source before making network calls',()=>{
 const r=invoke({IVR_CONNECTOR:'../../private'});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/Unrecognized scheduled connector/);
 assert.ok(!r.stdout.includes('MOCK_REFRESH'));
});
test('the CLI rejects unsafe destinations without leaking its admin secret',()=>{
 const r=invoke({IVR_CONNECTOR:'research-park-1',IVR_SITE_URL:'https://127.0.0.1/'});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/public HTTPS site origin/);
 assert.ok(!r.stdout.includes('MOCK_REFRESH'));
 assert.ok(!r.stderr.includes(secret));
});
