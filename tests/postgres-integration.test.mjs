import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {database,all,parameterize,closeDatabase} from '../db/postgres.mjs';
import {decideSourceCandidate} from '../core/review-service.mjs';
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
