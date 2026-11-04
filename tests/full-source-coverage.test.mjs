import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {collectDirectory,parseDirectory,directoryUrl} from '../core/ingestion.mjs';
import {parseOTMCandidates} from '../core/source-adapters.mjs';
import {CONNECTORS,candidateStatements,newOTMCompany} from '../core/source-candidates.mjs';
import {SOURCE_REFRESH_ORDER,refreshTargets} from '../core/refresh-schedule.mjs';
import {refreshConnector} from '../core/refresh-runner.mjs';
import {decideSourceCandidate} from '../core/review-service.mjs';

const at='2026-11-04T12:00:00.000Z';
const listing='https://otm.illinois.edu/browse-technologies-startups/startups';
function otmHTML(names){
 return '<nav><h4>Unrelated Nav Item</h4><a href="https://external.example.org/">Contact</a></nav>'+
 '<main><h1>Startups</h1><h3>Agriculture &amp; Animal Health</h3>'+
 names.map(name=>'<h4>'+name+'</h4><p>Research and products from '+name+
 '.</p><p><a href="https://'+name.toLowerCase().replaceAll(' ','-')+'.example.org/">Website</a></p>').join('')+
 '</main><footer><h4>Fake Footer Venture</h4></footer>';
}
function store(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('PRAGMA foreign_keys=ON;');
 for(const filename of ['0000_first_drax.sql','0001_source_refresh.sql'])
  sqlite.exec(readFileSync(new URL('../drizzle/'+filename,import.meta.url),'utf8'));
 const db={
  prepare(sql){return {bind(...values){return {
   async all(){return {results:sqlite.prepare(sql).all(...values)};},
   async run(){const r=sqlite.prepare(sql).run(...values);return {meta:{changes:r.changes}};}
  };}}},
  async batch(q){
   sqlite.exec('BEGIN');try{const results=[];for(const s of q)results.push(await s.run());sqlite.exec('COMMIT');return results;}
   catch(e){sqlite.exec('ROLLBACK');throw e;}
  }
 };
 return {sqlite,db};
}
async function stage(sqlite,candidate){
 const op=await candidateStatements(candidate,at);
 sqlite.prepare(op.sql).run(...op.values);
 return op.id;
}

test('full Research Park startup directory is covered by explicit paginated sources',()=>{
 const pages=Array.from({length:5},(_,i)=>'research-park-'+(i+1));
 assert.ok(pages.every(c=>CONNECTORS.includes(c)&&SOURCE_REFRESH_ORDER.includes(c)));
 assert.ok(pages.every(c=>refreshTargets('all').includes(c)));
 assert.ok(pages.every(c=>refreshTargets('scheduled',1).includes(c)));
 assert.deepEqual(refreshTargets('scheduled',2),['research-park-news','illinois-news']);
 assert.equal(SOURCE_REFRESH_ORDER.length,CONNECTORS.length);
});
test('default Research Park collector reads all five official pages, not the first three',async()=>{
 const visited=[];
 const fetcher=async url=>{
  visited.push(url);
  if(url.endsWith('/robots.txt'))return new Response('User-agent: *\nAllow: /\n');
  const page=Number(url.match(/\/page\/(\d+)\//)?.[1]||'1');
  const html='<article><a rel="category tag">Startup</a><a rel="category tag">Tenant Directory</a>'+
   '<h2 class="entry-title"><a href="https://researchpark.illinois.edu/real-venture-'+page+'/">Real Venture '+page+'</a></h2></article>';
  return new Response(html);
 };
 const records=await collectDirectory({fetcher,wait:async()=>{}});
 assert.equal(records.length,5);
 assert.equal(new Set(records.map(r=>r.slug)).size,5);
 assert.ok(visited.includes(directoryUrl+'page/5/'));
 assert.equal(records.at(-1).sourceUrl,directoryUrl+'page/5/');
 await assert.rejects(()=>collectDirectory({pages:6,fetcher,wait:async()=>{}}),/Invalid directory/);
 assert.throws(()=>parseDirectory('<article></article>',directoryUrl+'page/6/',at),/Invalid official directory page/);
});
test('OTM parses a complete structured sector catalog without requiring prior company records',()=>{
 const names=Array.from({length:72},(_,i)=>'Venture '+(i+1));
 const entries=parseOTMCandidates(otmHTML(names),[{id:'existing',name:'Venture 2'}],at);
 assert.equal(entries.length,72);
 assert.equal(entries.filter(x=>x.companyId).length,1);
 assert.equal(entries.find(x=>x.companyName==='Venture 2').companyId,'existing');
 assert.equal(entries.find(x=>x.companyName==='Venture 72').companyId,null);
 assert.equal(entries[0].sourceUrl,listing);
 assert.equal(entries[0].payload.sector,'Agriculture & Animal Health');
 assert.equal(entries[0].payload.ventureWebsite,'https://venture-1.example.org/');
 assert.ok(entries.every(x=>x.eventDate===null));
 assert.ok(!entries.some(x=>x.companyName.includes('Footer')||x.companyName.includes('Nav')));
 assert.ok(entries.every(x=>!JSON.stringify(x).includes('"funding"')));
});
test('OTM excludes nav-only names and refuses to invent unrelated company identity',()=>{
 assert.deepEqual(parseOTMCandidates('<nav><a>Venture Nine</a></nav>',[],at),[]);
 const entries=parseOTMCandidates(otmHTML(['Venture 9']),[],at);
 assert.equal(entries[0].companyId,null);
});
test('OTM legacy explicit startup cards remain discoverable without a known matching company',()=>{
 const html='<article class="startup"><h3><a href="https://otm.illinois.edu/startups/field-labs/">Field Labs</a></h3>'+
 '<p><a href="https://field-labs.example.org/">Company website</a></p></article>';
 const rows=parseOTMCandidates(html,[],at);
 assert.equal(rows.length,1);
 assert.equal(rows[0].companyId,null);
 assert.equal(rows[0].payload.entryUrl,'https://otm.illinois.edu/startups/field-labs/');
});
test('OTM entry without a linked public website cannot be created as an approved company',async()=>{
 const row=parseOTMCandidates('<h3>Agriculture &amp; Animal Health</h3><h4>Site-less Venture</h4>',[],at)[0];
 const candidate={...row,source_url:row.sourceUrl,company_name:row.companyName,company_id:null,status:'Pending',payload:JSON.stringify(row.payload),id:'a'.repeat(64)};
 await assert.rejects(()=>newOTMCompany(candidate,at),/no linked venture website/);
});
test('large OTM discovery is staged without publishing claims and can be reviewed beyond page 100',async()=>{
 const {sqlite}=store();
 try{
  const entries=parseOTMCandidates(otmHTML(Array.from({length:132},(_,i)=>'Startup '+(i+1))),[],at);
  assert.equal(entries.length,132);
  for(const entry of entries)await stage(sqlite,entry);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM source_candidates').get().n,132);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM companies').get().n,0);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM claims').get().n,0);
  const countPage=offset=>sqlite.prepare("SELECT id FROM source_candidates WHERE status='Pending' ORDER BY observed_at DESC,id DESC LIMIT 50 OFFSET ?").all(offset).length;
  assert.deepEqual([countPage(0),countPage(50),countPage(100)],[50,50,32]);
  const api=readFileSync(new URL('../app/api/admin/candidates/route.ts',import.meta.url),'utf8');
  assert.match(api,/LIMIT \? OFFSET \?/);
  assert.match(api,/pageSize=50/);
 }finally{sqlite.close();}
});
test('a new OTM company is created only by an explicit audited review decision',async()=>{
 const {sqlite,db}=store();
 try{
  const row=parseOTMCandidates(otmHTML(['Approved Venture']),[],at)[0];
  const id=await stage(sqlite,row);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM companies').get().n,0);
  const r=await decideSourceCandidate(db,{id,decision:'create',now:at});
  assert.equal(r.ok,true);
  assert.equal(r.status,'Approved');
  const company=sqlite.prepare('SELECT * FROM companies WHERE id=?').get(r.companyId);
  assert.equal(company.name,'Approved Venture');
  assert.equal(company.profile,'https://approved-venture.example.org/');
  const claim=sqlite.prepare("SELECT * FROM claims WHERE company_id=? AND field='university IP startup'").get(r.companyId);
  assert.ok(claim);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM evidence WHERE claim_id=?').get(claim.id).n,1);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM audit WHERE action=?').get('candidate-create').n,1);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM claims WHERE field='funding'").get().n,0);
  await assert.rejects(()=>decideSourceCandidate(db,{id,decision:'create',now:at}),/not pending/);
 }finally{sqlite.close();}
});
test('repeat refresh links a newly known exact OTM company without resetting an approved candidate',async()=>{
 const {sqlite,db}=store();
 const html=otmHTML(['Reconciled Venture']);
 const fetcher=async url=>new Response(url.endsWith('robots.txt')?'User-agent: *\nAllow: /\n':html);
 try{
  const first=await refreshConnector(db,'otm-startups',{fetcher,now:at});
  assert.equal(first.staged,1);
  const before=sqlite.prepare('SELECT * FROM source_candidates').get();
  assert.equal(before.company_id,null);
  sqlite.prepare('INSERT INTO companies(id,name,profile,first_observed,updated_at) VALUES(?,?,?,?,?)')
   .run('reconciled','Reconciled Venture','https://reconciled-venture.example.org/',at,at);
  const second=await refreshConnector(db,'otm-startups',{fetcher,now:at});
  assert.equal(second.staged,0);
  assert.equal(sqlite.prepare('SELECT company_id FROM source_candidates').get().company_id,'reconciled');
  await decideSourceCandidate(db,{id:before.id,decision:'approve',now:at});
  await refreshConnector(db,'otm-startups',{fetcher,now:at});
  assert.equal(sqlite.prepare('SELECT status FROM source_candidates').get().status,'Approved');
 }finally{sqlite.close();}
});
