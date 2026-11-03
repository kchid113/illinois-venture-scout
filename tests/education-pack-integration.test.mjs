import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const checkIn='https://api.honeybadger.io/v1/check_in/test_case_ABC123';
const env={
 IVR_AUTOMATION_ENABLED:'true',IVR_ADMIN_TOKEN:'a'.repeat(45),
 IVR_SITE_URL:'https://venture.example.org/',
 IVR_HONEYBADGER_CHECKIN_URL:checkIn,IVR_CONNECTOR:'scheduled'
};
function run(patch={}){
 return spawnSync(process.execPath,['--import','./tests/fixtures/mock-education-pack-fetch.mjs','scripts/refresh-site.mjs'],{
  env:{...process.env,...env,...patch},encoding:'utf8',timeout:12000
 });
}
test('complete scheduled refresh sends exactly one post-success Honeybadger check-in',()=>{
 const r=run();
 assert.equal(r.status,0,r.stderr);
 assert.equal((r.stdout.match(/MOCK_CHECKIN/g)||[]).length,1);
 assert.ok((r.stdout.match(/MOCK_SOURCE/g)||[]).length>=2);
 assert.ok(r.stdout.indexOf('MOCK_CHECKIN')>r.stdout.lastIndexOf('MOCK_SOURCE'));
 assert.ok(!r.stdout.includes(checkIn));
 assert.ok(!r.stderr.includes(checkIn));
});
test('a failed source refresh never marks the scheduled run as healthy',()=>{
 const r=run({IVR_TEST_FAIL_CONNECTOR:'research-park-news'});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/refresh connector\(s\) failed/);
 assert.ok(!r.stdout.includes('MOCK_CHECKIN'));
});
test('a successful manual refresh does not spoof the daily scheduled monitoring heartbeat',()=>{
 const r=run({IVR_CONNECTOR:'iventure-cohorts'});
 assert.equal(r.status,0,r.stderr);
 assert.equal((r.stdout.match(/MOCK_SOURCE/g)||[]).length,1);
 assert.ok(!r.stdout.includes('MOCK_CHECKIN'));
});
test('disabled refresh never reaches third-party monitoring or source endpoints',()=>{
 const r=run({IVR_AUTOMATION_ENABLED:'false'});
 assert.equal(r.status,0,r.stderr);
 assert.ok(!r.stdout.includes('MOCK_SOURCE'));
 assert.ok(!r.stdout.includes('MOCK_CHECKIN'));
});
test('an unreachable check-in fails without leaking a URL credential',()=>{
 const r=run({IVR_TEST_FAIL_CHECKIN:'true'});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/Honeybadger check-in rejected/);
 assert.ok(!r.stderr.includes(checkIn));
});
test('no Honeybadger URL still allows the existing scheduled workflow to pass',()=>{
 const r=run({IVR_HONEYBADGER_CHECKIN_URL:''});
 assert.equal(r.status,0,r.stderr);
 assert.ok(!r.stdout.includes('MOCK_CHECKIN'));
});
