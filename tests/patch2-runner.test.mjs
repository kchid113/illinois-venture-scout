import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {recordStatements} from '../core/records.mjs';
import {refreshConnector} from '../core/refresh-runner.mjs';

const at='2026-11-03T12:00:00.000Z';
const originals=JSON.parse(readFileSync(new URL('../data/import.json',import.meta.url),'utf8'));
const original=originals[0];
function store(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('PRAGMA foreign_keys=ON;');
 for(const migration of ['0000_first_drax.sql','0001_source_refresh.sql'])
  sqlite.exec(readFileSync(new URL('../drizzle/'+migration,import.meta.url),'utf8'));
 const db={
  prepare(sql){return {bind(...v){return {
   async all(){return {results:sqlite.prepare(sql).all(...v)};},
   async run(){const x=sqlite.prepare(sql).run(...v);return {meta:{changes:x.changes}};}
  };}}},
  async batch(q){sqlite.exec('BEGIN');try{const r=[];for(const p of q)r.push(await p.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
 };
 return {sqlite,db};
}
async function seed(sqlite,r=original){for(const s of await recordStatements(r))sqlite.prepare(s.sql).run(...s.values);}
const news='<article><h2><a href="https://researchpark.illinois.edu/new-award/">'+original.name+' wins award</a></h2><time datetime="2026-10-18"></time></article>';
const mockHtml=async url=>new Response(String(url).endsWith('robots.txt')?'User-agent: *\nAllow: /\n':news,{status:200});
const run=(name,fn)=>test(name,async()=>{const {sqlite,db}=store();try{await fn(sqlite,db);}finally{sqlite.close();}});

run('unrecognized connector does not create leases, jobs or source candidates',async(sqlite,db)=>{
 await assert.rejects(()=>refreshConnector(db,'unknown',{now:at}),/Unknown refresh connector/);
 for(const table of ['refresh_leases','ingestion_jobs','source_candidates'])
  assert.equal(sqlite.prepare('SELECT count(*) n FROM '+table).get().n,0);
});
run('source refresh enforces an unexpired lease and never starts another job',async(sqlite,db)=>{
 sqlite.prepare('INSERT INTO refresh_leases(name,token,expires_at) VALUES(?,?,?)').run('research-park-news','busy','2030-01-01T00:00:00Z');
 await assert.rejects(()=>refreshConnector(db,'research-park-news',{fetcher:mockHtml,now:at}),/already running/);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM ingestion_jobs').get().n,0);
 assert.equal(sqlite.prepare('SELECT token FROM refresh_leases').get().token,'busy');
});
run('expired source lease can be recovered without deleting unrelated leases',async(sqlite,db)=>{
 sqlite.prepare('INSERT INTO refresh_leases(name,token,expires_at) VALUES(?,?,?)').run('research-park-news','expired','2020-01-01T00:00:00Z');
 sqlite.prepare('INSERT INTO refresh_leases(name,token,expires_at) VALUES(?,?,?)').run('iventure-cohorts','other','2030-01-01T00:00:00Z');
 await seed(sqlite);
 const done=await refreshConnector(db,'research-park-news',{fetcher:mockHtml,now:at});
 assert.equal(done.staged,1);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM refresh_leases WHERE name='research-park-news'").get().n,0);
 assert.equal(sqlite.prepare("SELECT token FROM refresh_leases WHERE name='iventure-cohorts'").get().token,'other');
});
run('403 restriction marks job failed, keeps existing company data and releases the lease',async(sqlite,db)=>{
 await seed(sqlite);
 const before=sqlite.prepare('SELECT count(*) n FROM companies').get().n;
 const blocked=async()=>new Response('',{status:403});
 await assert.rejects(()=>refreshConnector(db,'research-park-news',{fetcher:blocked,now:at}),/restricted/);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM companies').get().n,before);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM source_candidates').get().n,0);
 assert.equal(sqlite.prepare('SELECT status FROM ingestion_jobs').get().status,'Failed');
 assert.equal(sqlite.prepare('SELECT count(*) n FROM refresh_leases').get().n,0);
});
run('unknown NIH recipient identities never generate funding searches or fabricated awards',async(sqlite,db)=>{
 await seed(sqlite);
 let calls=0;
 const fetcher=async()=>{calls++;throw Error('unexpected network call');};
 const result=await refreshConnector(db,'nih-reporter',{fetcher,now:at});
 assert.equal(result.staged,0);assert.equal(result.imported,0);
 assert.equal(calls,0);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM claims WHERE field='research award'").get().n,0);
});
run('unknown USAspending UEIs never generate company-name-only award searches',async(sqlite,db)=>{
 await seed(sqlite);
 let calls=0;
 const fetcher=async()=>{calls++;throw Error('unexpected network call');};
 const result=await refreshConnector(db,'usaspending',{fetcher,now:at});
 assert.equal(result.staged,0);assert.equal(result.imported,0);
 assert.equal(calls,0);
});
run('unknown GitHub repository mappings never generate repository-name guesses',async(sqlite,db)=>{
 await seed(sqlite);
 let calls=0;
 const fetcher=async()=>{calls++;throw Error('unexpected network call');};
 const result=await refreshConnector(db,'github-releases',{fetcher,now:at});
 assert.equal(result.imported,0);
 assert.equal(calls,0);
});
run('repeated news refresh is idempotent and never publishes a claim without review',async(sqlite,db)=>{
 await seed(sqlite);
 const a=await refreshConnector(db,'research-park-news',{fetcher:mockHtml,now:at});
 assert.equal(a.staged,1);
 const b=await refreshConnector(db,'research-park-news',{fetcher:mockHtml,now:at});
 assert.equal(b.staged,0);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM source_candidates').get().n,1);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM claims WHERE field='news'").get().n,0);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM ingestion_jobs').get().n,2);
});
run('approved discovery is never reset to pending by a duplicate source refresh',async(sqlite,db)=>{
 await seed(sqlite);
 await refreshConnector(db,'research-park-news',{fetcher:mockHtml,now:at});
 sqlite.prepare("UPDATE source_candidates SET status='Approved'").run();
 await refreshConnector(db,'research-park-news',{fetcher:mockHtml,now:at});
 assert.equal(sqlite.prepare('SELECT status FROM source_candidates').get().status,'Approved');
});
run('directory adapter selects exactly the requested page without a live fetch',async(sqlite,db)=>{
 const calls=[];
 const collector=async({startPage,pages})=>{calls.push([startPage,pages]);return [{...original,retrievedAt:at}];};
 const fakeFetch=async()=>{throw Error('must not perform network requests when directory collector injected');};
 const a=await refreshConnector(db,'research-park-2',{directoryCollector:collector,fetcher:fakeFetch,now:at});
 assert.equal(a.imported,1);
 assert.deepEqual(calls,[[2,1]]);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM companies').get().n,1);
});
run('directory importer queues a changed canonical identity instead of rewriting it',async(sqlite,db)=>{
 await seed(sqlite);
 const collector=async()=>[{...original,name:'Different Business',retrievedAt:at}];
 const a=await refreshConnector(db,'research-park-1',{directoryCollector:collector,now:at});
 assert.equal(a.imported,0);
 assert.equal(a.deferred,1);
 assert.equal(sqlite.prepare('SELECT name FROM companies').get().name,original.name);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM review_queue WHERE status='Pending'").get().n,1);
});
run('directory importer does not silently duplicate an existing company name under a new slug',async(sqlite,db)=>{
 await seed(sqlite);
 const collector=async()=>[{...original,slug:'new-slug',profile:'https://researchpark.illinois.edu/new-slug/',retrievedAt:at}];
 const a=await refreshConnector(db,'research-park-1',{directoryCollector:collector,now:at});
 assert.equal(a.imported,0);
 assert.equal(a.deferred,1);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM companies').get().n,1);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM review_queue').get().n,1);
});
run('directory refresh parser errors create no new companies and preserve failure details',async(sqlite,db)=>{
 const collector=async()=>{throw Error('The official directory changed layout');};
 await assert.rejects(()=>refreshConnector(db,'research-park-1',{directoryCollector:collector,now:at}),/changed layout/);
 assert.equal(sqlite.prepare('SELECT status FROM ingestion_jobs').get().status,'Failed');
 assert.match(sqlite.prepare('SELECT message FROM ingestion_jobs').get().message,/changed layout/);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM companies').get().n,0);
});
