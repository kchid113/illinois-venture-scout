import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {refreshTargets,refreshConfiguration,SOURCE_REFRESH_ORDER} from '../core/refresh-schedule.mjs';
import {CONNECTORS} from '../core/source-candidates.mjs';
import {officialSourceUrl,publicVentureWebsite,publishedDate,trustedOfficialProfile} from '../core/source-security.mjs';

const token='a'.repeat(48);
test('all supported connectors have exactly one scheduler entry',()=>{
 assert.equal(new Set(CONNECTORS).size,CONNECTORS.length);
 assert.deepEqual([...new Set(SOURCE_REFRESH_ORDER)].sort(),[...CONNECTORS].sort());
});
for(let day=0;day<7;day++){
 test('scheduled refresh respects UTC weekday '+day,()=>{
  const targets=refreshTargets('scheduled',day);
  assert.deepEqual(targets,day===1?[...SOURCE_REFRESH_ORDER]:['research-park-news','illinois-news']);
 });
}
for(const request of [...SOURCE_REFRESH_ORDER,'all']){
 test('manual scheduler permits named approved source '+request,()=>{
  const targets=refreshTargets(request,0);
  assert.deepEqual(targets,request==='all'?[...SOURCE_REFRESH_ORDER]:[request]);
 });
}
for(const v of ['','bogus','../../admin','https://x.test','ALL']){
 test('schedule rejects unsupported connector '+v,()=>{
  assert.throws(()=>refreshTargets(v,1),/Unrecognized/);
 });
}
for(const d of [-1,7,1.5,NaN,'1',null]){
 test('schedule rejects invalid weekday '+String(d),()=>{
  assert.throws(()=>refreshTargets('scheduled',d),/weekday/);
 });
}
test('schedule rejects missing admin secret and never puts its value in errors',()=>{
 for(const candidate of [null,'','short',undefined]){
  assert.throws(()=>refreshConfiguration({IVR_SITE_URL:'https://venture.example.org/',IVR_ADMIN_TOKEN:candidate}),/32\+/);
 }
});
for(const url of [
 'http://venture.example.org/','http://localhost/','https://localhost/','https://127.0.0.1/',
 'https://169.254.169.254/latest/meta-data/','https://192.168.0.1/','https://10.0.0.1/',
 'https://[::1]/','https://venture.example.org/admin','https://venture.example.org/?x=1',
 'https://venture.example.org/#secret','https://user:password@venture.example.org/',
 'https://venture.example.org:8443/'
]){
 test('schedule refuses unsafe destination '+url,()=>{
  assert.throws(()=>refreshConfiguration({IVR_SITE_URL:url,IVR_ADMIN_TOKEN:token}),/HTTPS|origin/);
 });
}
test('schedule accepts only a clean publicly routable HTTPS origin',()=>{
 const c=refreshConfiguration({IVR_SITE_URL:'https://venture.example.org/',IVR_ADMIN_TOKEN:token});
 assert.equal(c.base,'https://venture.example.org/');
 assert.equal(c.token,token);
 assert.equal(c.serviceToken,null);
});
test('CLI refresh command is opt-in and disabled without a service credential',()=>{
 const r=spawnSync(process.execPath,['scripts/refresh-site.mjs'],{
  env:{...process.env,IVR_AUTOMATION_ENABLED:'false',IVR_ADMIN_TOKEN:'',IVR_SITE_URL:''},
  encoding:'utf8',timeout:10000
 });
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/disabled/);
});
test('CLI cannot run when deliberately enabled with missing auth',()=>{
 const r=spawnSync(process.execPath,['scripts/refresh-site.mjs'],{
  env:{...process.env,IVR_AUTOMATION_ENABLED:'true',IVR_ADMIN_TOKEN:'',IVR_SITE_URL:'https://venture.example.org/'},
  encoding:'utf8',timeout:10000
 });
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/32\+ character/);
});
test('GitHub scheduled workflow cannot run until repository variable explicitly enables it',()=>{
 const file=readFileSync(new URL('../.github/workflows/refresh-public-sources.yml',import.meta.url),'utf8');
 assert.match(file,/vars\.IVR_AUTOMATION_ENABLED == 'true'/);
 assert.match(file,/secrets\.IVR_ADMIN_TOKEN/);
 assert.match(file,/cron:/);
 assert.match(file,/cancel-in-progress: false/);
 assert.ok(!file.includes('admin-secret-text'));
});
test('official-source URL policies reject escalation, lookalikes and redirected paths',()=>{
 assert.equal(officialSourceUrl('https://iventure.illinois.edu/startups','iventure-cohorts'),
  'https://iventure.illinois.edu/startups');
 for(const [url,type] of [
  ['https://iventure.illinois.edu.other.test/startups','iventure-cohorts'],
  ['https://iventure.illinois.edu/admin','iventure-cohorts'],
  ['https://researchpark.illinois.edu/category/tenant-directory/enterpriseworks-incubator/page/7/','enterpriseworks-directory'],
  ['https://otm.illinois.edu/login','otm-startups'],
  ['https://reporter.nih.gov/project-details/not-an-id','nih-reporter']
 ]){
  assert.throws(()=>officialSourceUrl(url,type),/allowlist/);
 }
});
for(const date of ['2026-02-31','2026-13-01','2026-02-29','2026-11-00','2026-11-03T25:30:00Z','2026/11/03','not a date']){
 test('calendar validation refuses invalid event date '+date,()=>assert.equal(publishedDate(date),null));
}
test('strict dates support leap years, original dates and date-time inputs',()=>{
 assert.equal(publishedDate('2024-02-29'),'2024-02-29');
 assert.equal(publishedDate('November 3, 2026'),'2026-11-03');
 assert.equal(publishedDate('2026-11-03T12:00:00.000Z'),'2026-11-03');
});
test('trusted profile and venture website policies preserve valid sources',()=>{
 assert.equal(trustedOfficialProfile('https://researchpark.illinois.edu/archean-sciences/'),'https://researchpark.illinois.edu/archean-sciences/');
 assert.equal(publicVentureWebsite('https://venture.example.org/'),'https://venture.example.org/');
 assert.throws(()=>publicVentureWebsite('https://metadata.internal/'),/Untrusted company website/);
 assert.throws(()=>trustedOfficialProfile('https://evil.test/archean-sciences/'),/Invalid Research Park official profile/);
});
