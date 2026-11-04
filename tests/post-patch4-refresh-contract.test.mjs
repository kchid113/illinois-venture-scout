import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {validateRefreshResponse,refreshHttpError} from '../core/refresh-contract.mjs';
import {refreshTargets} from '../core/refresh-schedule.mjs';

const connector='research-park-news',jobId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const valid={connector,jobId,observed:3,imported:1,staged:1,deferred:0};
const token='not-real-secret-token-'+('Z'.repeat(44));
const env={
 IVR_AUTOMATION_ENABLED:'true',IVR_ADMIN_TOKEN:token,
 IVR_SITE_URL:'https://venture.example.org/',
 IVR_CONNECTOR:'scheduled',
 IVR_HONEYBADGER_CHECKIN_URL:'https://api.honeybadger.io/v1/check_in/FAKE_TOKEN_FOR_TEST'
};
const exec=(config={})=>spawnSync(process.execPath,[
 '--import','./tests/fixtures/mock-integrated-refresh-fetch.mjs',
 'scripts/refresh-site.mjs'
],{cwd:process.cwd(),encoding:'utf8',timeout:13000,env:{...process.env,...env,...config}});
const checkSecretSafe=r=>{
 assert.ok(!r.stdout.includes(token));
 assert.ok(!r.stderr.includes(token));
 assert.ok(!r.stdout.includes('FAKE_TOKEN_FOR_TEST'));
 assert.ok(!r.stderr.includes('FAKE_TOKEN_FOR_TEST'));
};
test('valid successful endpoint job receipt returns normalized frozen counters',()=>{
 const result=validateRefreshResponse(connector,valid);
 assert.deepEqual(result,valid);
 assert.ok(Object.isFrozen(result));
 assert.notStrictEqual(result,valid);
});
test('valid zero-activity refresh is successful, not fabricated as a failed job',()=>{
 const z=validateRefreshResponse(connector,{...valid,observed:0,imported:0,staged:0,deferred:4});
 assert.equal(z.observed,0);
 assert.equal(z.deferred,4);
});
test('explicit unknown integer count is rejected rather than guessed to be zero',()=>{
 for(const field of ['observed','imported','staged','deferred']){
  const testValues=[-1,1.5,NaN,Infinity,-Infinity,null,undefined,'2',false,Number.MAX_SAFE_INTEGER+1];
  for(const v of testValues)assert.throws(
   ()=>validateRefreshResponse(connector,{...valid,[field]:v}),new RegExp(field+' count'));
 }
});
for(const patch of [
 {connector:'another-source'}, {jobId:'42'},{jobId:null},{jobId:'AAAAAAAA-AAAA-3AAA-8AAA-AAAAAAAAAAAA'},
 {error:'upstream failed'},{ok:false},{status:'Failed'},
 {observed:1,imported:1,staged:1},
 {observed:0,imported:1},
 {observed:5,imported:4,staged:3}
]){
 test('refresh response rejects misleading success receipt '+JSON.stringify(patch),()=>{
  assert.throws(()=>validateRefreshResponse(connector,{...valid,...patch}),/Refresh endpoint/);
 });
}
for(const payload of [null,[],1,'OK',true,NaN,undefined,Object.create(null)]){
 test('refresh response refuses malformed JSON result '+String(payload),()=>{
  assert.throws(()=>validateRefreshResponse(connector,payload),/Refresh endpoint/);
 });
}
for(const input of ['',null,1,'../../admin','research_park','https://evil.test']){
 test('refresh validation rejects an unapproved caller connector '+String(input),()=>{
  assert.throws(()=>validateRefreshResponse(input,valid),/Invalid requested refresh connector/);
 });
}
test('server errors include HTTP status without exposing arbitrary response JSON',()=>{
 for(const status of [401,403,429,500,502,503]){
  const msg=refreshHttpError(status).message;
  assert.ok(msg.includes('HTTP '+status));
  assert.ok(!msg.includes(token));
 }
});
test('complete scheduled refresh sends one heartbeat only after all validated receipts',()=>{
 const r=exec();
 assert.equal(r.status,0,r.stderr);
 assert.equal((r.stdout.match(/HEARTBEAT_SENT/g)||[]).length,1);
 assert.equal((r.stdout.match(/SOURCE_REQUEST/g)||[]).length,refreshTargets('scheduled').length);
 assert.ok(r.stdout.indexOf('HEARTBEAT_SENT')>r.stdout.lastIndexOf('SOURCE_REQUEST'));
 checkSecretSafe(r);
});
const badModes=[
 'http503','nonjson','okFalse','error','wrongConnector',
 'jobMissing','jobInvalid','negative','string','float','inconsistent','statusFailed','array','null'
];
for(const mode of badModes){
 test('no successful Honeybadger heartbeat on misleading refresh response '+mode,()=>{
  const r=exec({IVR_TEST_RECEIPT_MODE:mode});
  assert.notEqual(r.status,0);
  assert.ok(!r.stdout.includes('HEARTBEAT_SENT'));
  assert.match(r.stderr,/refresh connector\(s\) failed/);
  // Other connectors still get attempted so jobs remain observable.
  assert.equal((r.stdout.match(/SOURCE_REQUEST/g)||[]).length,refreshTargets('scheduled').length);
  checkSecretSafe(r);
 });
}
test('explicit manual source check must never send a scheduled Honeybadger heartbeat',()=>{
 const r=exec({IVR_CONNECTOR:'research-park-news'});
 assert.equal(r.status,0,r.stderr);
 assert.equal((r.stdout.match(/SOURCE_REQUEST/g)||[]).length,1);
 assert.ok(!r.stdout.includes('HEARTBEAT_SENT'));
 checkSecretSafe(r);
});
test('disabled external source monitoring makes no provider requests',()=>{
 const r=exec({IVR_AUTOMATION_ENABLED:'false'});
 assert.equal(r.status,0,r.stderr);
 assert.ok(!r.stdout.includes('SOURCE_REQUEST'));
 assert.ok(!r.stdout.includes('HEARTBEAT_SENT'));
 checkSecretSafe(r);
});
