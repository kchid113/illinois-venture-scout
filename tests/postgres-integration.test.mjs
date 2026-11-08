import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {database,all,parameterize,closeDatabase} from '../db/postgres.mjs';
import {decideSourceCandidate} from '../core/review-service.mjs';
import {refreshConnector} from '../core/refresh-runner.mjs';
const uri=process.env.DATABASE_URL;
const integrated=(name,fn)=>test(name,{skip:!uri},fn);
const sql=uri?postgres(uri,{max:1,prepare:false,ssl:false}):null;
after(async()=>{if(sql)await sql.end();await closeDatabase();});
const uuidA='6d6e901a-91e1-4af7-aee4-1dd56349e191';
const uuidB='ee087cac-d3aa-4a68-b4b2-f3abac7df179';
test('Postgres placeholders do not transform question marks in quoted source text',()=>{
 assert.deepEqual(parameterize("SELECT '?' as literal, ? AS first, 'it''s ?' as second, ? AS third"),{
  sql:"SELECT '?' as literal, $1 AS first, 'it''s ?' as second, $2 AS third",count:2
 });
});
integrated('verified import contains 43 directory companies and 243 distinct pending observations',async()=>{
 const [row]=await all("SELECT (SELECT count(*) FROM companies) companies,(SELECT count(*) FROM source_candidates) candidates,(SELECT count(*) FROM claims c WHERE c.status IN ('Published','Conflicting') AND NOT EXISTS(SELECT 1 FROM evidence e WHERE e.claim_id=c.id AND e.relationship='supports')) unsupported");
 assert.equal(Number(row.companies),43);
 assert.equal(Number(row.candidates),243);
 assert.equal(Number(row.unsupported),0);
 const rows=await all('SELECT id,name,profile FROM companies');
 assert.equal(new Set(rows.map(x=>x.id)).size,43);
 assert.ok(rows.some(x=>x.name==='Lanward'));
});
integrated('review decisions remain one-time and source-backed under Postgres transactions',async()=>{
 const row=(await all("SELECT id FROM source_candidates WHERE status='Pending' AND company_id IS NOT NULL ORDER BY id LIMIT 1"))[0];
 assert.ok(row);
 const result=await decideSourceCandidate(database(),{id:row.id,decision:'approve',actor:'postgres-security-test'});
 assert.ok(result.companyId);
 const approved=(await all('SELECT status FROM source_candidates WHERE id=?',row.id))[0];
 assert.equal(approved.status,'Approved');
 await assert.rejects(()=>decideSourceCandidate(database(),{id:row.id,decision:'approve'}),/not pending/);
 const source=(await all("SELECT e.id FROM evidence e JOIN claims c ON e.claim_id=c.id WHERE c.company_id=? AND e.relationship='supports' LIMIT 1",result.companyId))[0];
 assert.ok(source);
});
integrated('database batch rolls back all writes when a later statement fails',async()=>{
 const d=database();const key='rollback-test-company';
 await assert.rejects(()=>d.batch([
  d.prepare('INSERT INTO companies(id,name,profile,first_observed,updated_at) VALUES(?,?,?,?,?)').bind(key,'Test fixture','https://fixture.invalid','now','now'),
  d.prepare('INSERT INTO companies(id,name,profile,first_observed,updated_at) VALUES(?,?,?,?,?)').bind(key,'Duplicate','https://another.invalid','now','now')
 ]));
 assert.equal(Number((await all('SELECT count(*) n FROM companies WHERE id=?',key))[0].n),0);
});
integrated('Supabase workspace policies protect each investor at the actual database boundary',async()=>{
 await sql.unsafe('INSERT INTO auth.users(id) VALUES($1),($2) ON CONFLICT DO NOTHING',[uuidA,uuidB]);
 const runAs=async(id,fn)=>sql.begin(async tx=>{
  await tx.unsafe("SELECT set_config('request.jwt.claim.sub',$1,true)",[id]);
  await tx.unsafe('SET LOCAL ROLE authenticated');
  return fn(tx);
 });
 await runAs(uuidA,async tx=>{
  await tx.unsafe('INSERT INTO workspace(user_id,kind,key,value,updated_at) VALUES($1,$2,$3,$4,$5)',[uuidA,'note','test-company','Private A','now']);
 });
 await runAs(uuidB,async tx=>{
  await tx.unsafe('INSERT INTO workspace(user_id,kind,key,value,updated_at) VALUES($1,$2,$3,$4,$5)',[uuidB,'note','test-company','Private B','now']);
 });
 const fromA=await runAs(uuidA,async tx=>tx.unsafe("SELECT value FROM workspace WHERE key='test-company'"));
 const fromB=await runAs(uuidB,async tx=>tx.unsafe("SELECT value FROM workspace WHERE key='test-company'"));
 assert.deepEqual(fromA.map(x=>x.value),['Private A']);
 assert.deepEqual(fromB.map(x=>x.value),['Private B']);
 await assert.rejects(()=>runAs(uuidA,tx=>tx.unsafe('INSERT INTO workspace(user_id,kind,key,value,updated_at) VALUES($1,$2,$3,$4,$5)',[uuidB,'note','malicious','No','now'])),/row-level security/i);
 await assert.rejects(()=>sql.begin(async tx=>{
  await tx.unsafe('SET LOCAL ROLE anon');
  await tx.unsafe('SELECT value FROM workspace');
 }),/permission denied/i);
});

integrated('all five startup directory pages are actionable, not empty scheduled successes',async()=>{
 const seed=JSON.parse((await import('node:fs/promises')).readFile?await (await import('node:fs/promises')).readFile(new URL('../data/import.json',import.meta.url),'utf8'):'[]')[0];
 const calls=[];
 const collect=async opts=>{calls.push(opts.startPage);return [seed];};
 const first=await refreshConnector(database(),'research-park-4',{
  directoryCollector:collect,pause:async()=>{},now:'2026-11-07T21:00:00.000Z'
 });
 const second=await refreshConnector(database(),'research-park-5',{
  directoryCollector:collect,pause:async()=>{},now:'2026-11-07T21:01:00.000Z'
 });
 assert.deepEqual(calls,[4,5]);
 assert.equal(first.observed,1);
 assert.equal(second.observed,1);
 assert.equal(first.imported,0);
 assert.equal(second.imported,0);
 assert.equal(first.updated,1);
 assert.equal(second.updated,1);
});
integrated('only reviewed NIH recipient identities create pending, provenance-carrying award candidates',async()=>{
 const company=(await all('SELECT id,name FROM companies ORDER BY name LIMIT 1'))[0];
 const source=(await all('SELECT id FROM sources ORDER BY id LIMIT 1'))[0];
 const claimId='ci-verified-nih-recipient';
 await database().batch([
  database().prepare("INSERT INTO claims(id,company_id,field,value,classification,status,first_observed,verified_at) VALUES(?,?,?,'CI Verified Research Institute','Verified factual','Published',?,?) ON CONFLICT DO NOTHING")
   .bind(claimId,company.id,'nih organization','2026-11-07T00:00:00.000Z','2026-11-07T00:00:00.000Z'),
  database().prepare("INSERT INTO evidence(id,claim_id,source_id,excerpt,relationship,method,verified_at) VALUES(?,?,?,'Verified institutional name','supports','CI evidence','2026-11-07T00:00:00.000Z') ON CONFLICT DO NOTHING")
   .bind('ci-nih-evidence',claimId,source.id)
 ]);
 let calls=0;
 const fetcher=async (url)=>{
  assert.equal(url,'https://api.reporter.nih.gov/v2/projects/search');
  calls++;
  return new Response(JSON.stringify({results:[{
   appl_id:99334411,organization:{org_name:'CI Verified Research Institute'},
   project_title:'Technology transfer research',project_num:'R01-TEST-123',
   award_amount:120000,award_notice_date:'2026-11-01'
  }]}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const before=await all("SELECT count(*) n FROM source_candidates WHERE connector='nih-reporter'");
 const first=await refreshConnector(database(),'nih-reporter',{fetcher,pause:async()=>{},maxMappingsPerRun:2});
 assert.equal(first.mappingsChecked,1);
 assert.equal(first.staged,1);
 const second=await refreshConnector(database(),'nih-reporter',{fetcher,pause:async()=>{},maxMappingsPerRun:2});
 assert.equal(second.mappingsChecked,1);
 assert.equal(second.staged,0);
 assert.equal(calls,2);
 const after=await all("SELECT count(*) n FROM source_candidates WHERE connector='nih-reporter' AND status='Pending'");
 assert.equal(Number(after[0].n),Number(before[0].n)+1);
 const row=(await all("SELECT source_url,excerpt,company_id FROM source_candidates WHERE connector='nih-reporter' LIMIT 1"))[0];
 assert.equal(row.company_id,company.id);
 assert.ok(row.source_url.startsWith('https://reporter.nih.gov/project-details/'));
 assert.ok(row.excerpt.includes('CI Verified Research Institute'));
 const linked=(await all("SELECT count(*) n FROM claims WHERE company_id=? AND field='NIH award'",company.id))[0];
 assert.equal(Number(linked.n),0,'unreviewed award must not enter company claims');
});
integrated('GitHub releases advance bounded checkpoints, wrap around, and never duplicate verified events',async()=>{
 const names=await all('SELECT id,name FROM companies ORDER BY id LIMIT 7');
 const source=(await all('SELECT id FROM sources ORDER BY id LIMIT 1'))[0];
 assert.equal(names.length,7);
 for(let i=0;i<names.length;i++){
  const id='ci-verified-repo-'+i;
  const claim=database().prepare("INSERT INTO claims(id,company_id,field,value,classification,status,first_observed,verified_at) VALUES(?,?,? ,?,'Verified factual','Published',?,?) ON CONFLICT DO NOTHING")
   .bind(id,names[i].id,'repository','https://github.com/verified-ci/repo'+i,'2026-11-07T00:00:00.000Z','2026-11-07T00:00:00.000Z');
  const evidence=database().prepare("INSERT INTO evidence(id,claim_id,source_id,excerpt,relationship,method,verified_at) VALUES(?,?,?,'Reviewed repository identity','supports','CI evidence','2026-11-07T00:00:00.000Z') ON CONFLICT DO NOTHING")
   .bind('ci-repo-evidence-'+i,id,source.id);
  await database().batch([claim,evidence]);
 }
 const urls=[];
 const fetcher=async url=>{
  urls.push(url);
  const i=Number(url.match(/repo(\d+)/)?.[1]);
  assert.ok(Number.isInteger(i)&&i>=0&&i<7);
  return new Response(JSON.stringify([{
   id:551100+i,html_url:'https://github.com/verified-ci/repo'+i+'/releases/tag/v1.0',
   name:'Verified public release',published_at:'2026-11-02T11:00:00Z'
  }]),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const opts={fetcher,pause:async()=>{},maxMappingsPerRun:3};
 const outcomes=[];
 for(let i=0;i<4;i++)outcomes.push(await refreshConnector(database(),'github-releases',opts));
 assert.deepEqual(outcomes.map(x=>x.mappingsChecked),[3,3,1,3]);
 assert.deepEqual(outcomes.map(x=>x.imported),[3,3,1,0]);
 assert.equal(outcomes[3].updated,3);
 const [counts]=await all("SELECT count(*) n FROM signals WHERE dedup_key LIKE 'github:%:5511%'");
 assert.equal(Number(counts.n),7);
 assert.equal(urls.length,10);
 const cursor=(await all("SELECT last_claim_id FROM refresh_cursors WHERE name='github-releases'"))[0];
 assert.equal(cursor.last_claim_id,'ci-verified-repo-2');
});
integrated('failure keeps the last verified checkpoint and records a failed job without a stuck lease',async()=>{
 const old=(await all("SELECT last_claim_id FROM refresh_cursors WHERE name='github-releases'"))[0];
 let callCount=0;
 await assert.rejects(()=>refreshConnector(database(),'github-releases',{
  fetcher:async()=>{callCount++;throw Error('fetch failed');},
  pause:async()=>{},maxMappingsPerRun:1
 }),/fetch failed/);
 assert.equal(callCount,1);
 const now=(await all("SELECT last_claim_id FROM refresh_cursors WHERE name='github-releases'"))[0];
 assert.equal(now.last_claim_id,old.last_claim_id);
 const lease=(await all("SELECT count(*) n FROM refresh_leases WHERE name='github-releases'"))[0];
 assert.equal(Number(lease.n),0);
 const latest=(await all("SELECT status, message FROM ingestion_jobs WHERE connector='github-releases' ORDER BY started_at DESC LIMIT 1"))[0];
 assert.equal(latest.status,'Failed');
 assert.ok(latest.message.includes('fetch failed'));
});
integrated('OTM is rejected before making network or database changes',async()=>{
 let called=0;
 await assert.rejects(()=>refreshConnector(database(),'otm-startups',{
  fetcher:async()=>{called++;throw Error('unexpected fetch');}
 }),/automated collection is disabled/);
 assert.equal(called,0);
});
