import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 SOURCE_SCHEDULE,SCHEDULED_CONNECTORS,cronPath,isScheduledConnector,
 retryableFailure,executeScheduledConnector
} from '../core/source-schedule.mjs';
import {CONNECTORS,REFRESHABLE_STARTUP_CATALOG_CONNECTORS} from '../core/source-candidates.mjs';

const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const CRON_PATH='/api/cron/refresh/';
const receipt=id=>({connector:id,observed:1,imported:0,updated:0,staged:1,deferred:0,jobId:'9a97e061-18d7-4c13-b494-0a44a8f46f11'});
test('twelve distinct Vercel Cron jobs cover every permitted connector and exclude OTM',()=>{
 assert.equal(SOURCE_SCHEDULE.length,12);
 assert.equal(config.crons.length,12);
 assert.deepEqual(config.crons.map(c=>c.path).sort(),SOURCE_SCHEDULE.map(s=>cronPath(s.connector)).sort());
 for(const {connector,schedule} of SOURCE_SCHEDULE){
  assert.ok(CONNECTORS.includes(connector),connector);
  assert.ok(!connector.includes('otm-startups'));
  assert.deepEqual(config.crons.find(c=>c.path===CRON_PATH+connector),{path:CRON_PATH+connector,schedule});
  assert.match(schedule,/^\d{1,2} \d{1,2} \* \* (?:\*|[0-6])$/);
  assert.ok(isScheduledConnector(connector));
 }
 const unassigned=CONNECTORS.filter(c=>!SCHEDULED_CONNECTORS.includes(c));
 assert.deepEqual(unassigned,['otm-startups']);
 assert.equal(REFRESHABLE_STARTUP_CATALOG_CONNECTORS.length,7);
 for(const c of REFRESHABLE_STARTUP_CATALOG_CONNECTORS)assert.ok(isScheduledConnector(c));
});
test('untrusted or manual-only routes are rejected before invoking a collector',async()=>{
 const noop=()=>{throw Error('Untrusted connector must not be executed');};
 for(const name of ['otm-startups','__proto__','../secrets','',null,'research-park-6']){
  assert.equal(isScheduledConnector(name),false);
  await assert.rejects(()=>executeScheduledConnector(name,{db:{},refresh:noop}),/not scheduled/);
 }
});
test('bounded retries recover from temporary HTTP 503 while preserving a single source identity',async()=>{
 let calls=0,delays=[];
 const outcome=await executeScheduledConnector('nih-reporter',{
  db:{},refresh:async(_db,source)=>{calls++;if(calls<3)throw Error('Source HTTP 503');return receipt(source);},
  wait:async ms=>{delays.push(ms);}
 });
 assert.equal(outcome.attempt,3);assert.equal(calls,3);
 assert.deepEqual(delays,[1500,3000]);
});
test('rate limits, robots, 403, and HTTP 404 do not cause aggressive retries',async()=>{
 for(const msg of ['Source access restricted HTTP 429','Source HTTP 403',
  'Source robots policy disallows requested path','Source HTTP 404','Invalid repository']){
  let calls=0;
  await assert.rejects(()=>executeScheduledConnector('illinois-news',{
   db:{},refresh:async()=>{calls++;throw Error(msg);},wait:async()=>{}
  }),e=>e.message===msg);
  assert.equal(calls,1,msg);
  assert.equal(retryableFailure(Error(msg)),false);
 }
});
test('invalid success receipts cannot be accepted as completed ingestion',async()=>{
 await assert.rejects(()=>executeScheduledConnector('github-releases',{
  db:{},refresh:async()=>({connector:'other',jobId:'placeholder'}),wait:async()=>{}
 }),/invalid persisted job receipt/);
});
test('retry budget is capped even for persistent transient source failures',async()=>{
 let tries=0;
 await assert.rejects(()=>executeScheduledConnector('research-park-5',{
  db:{},refresh:async()=>{tries++;throw Error('fetch failed');},wait:async()=>{}
 }),/fetch failed/);
 assert.equal(tries,3);
});
