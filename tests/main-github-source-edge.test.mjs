import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {githubReleases} from '../core/github.mjs';
import {releaseStatements} from '../core/github-store.mjs';
import {recordStatements} from '../core/records.mjs';
const records=JSON.parse(readFileSync(new URL('../data/import.json',import.meta.url),'utf8'));
const claim=(extra={})=>({field:'repository',value:'https://github.com/acme/robotics',status:'Published',classification:'Verified factual',evidence:[{source_id:'reviewed-source',relationship:'supports'}],...extra});
const release=(extra={})=>({id:123,name:'v1.0',tag_name:'v1.0',draft:false,published_at:'2026-05-01T10:00:00Z',html_url:'https://github.com/acme/robotics/releases/tag/v1.0',...extra});
async function fetchMock(results,url=[]){return await githubReleases(claim(),async(address,options)=>{url.push({address,options});return new Response(JSON.stringify(results),{status:200,headers:{'Content-Type':'application/json'}});});}
for(const extra of [
 {field:'company'}, {status:'Rejected'}, {status:'Pending'}, {status:'Conflicting'},
 {classification:'Unverified'}, {classification:'Company-reported'}, {evidence:[]},
 {evidence:[{source_id:'x',relationship:'contradicts'}]}, {evidence:[{}]},
 {evidence:[{relationship:'supports'}]}
]){
 test('GitHub API requires an explicitly supported verified repository mapping '+JSON.stringify(extra),async()=>{
  await assert.rejects(()=>githubReleases(claim(extra),async()=>{throw Error('No network for unsupported claims');}),/repository|identity|evidence|review/i);
 });
}
for(const value of [
 'http://github.com/acme/robotics','https://github.com.evil.test/acme/robotics',
 'https://github.com/acme/robotics/issues','https://github.com/acme/robotics?redirect=true',
 'https://github.com/acme/robotics#fake','https://user:pw@github.com/acme/robotics',
 'https://github.com/acme/../other','https://github.com/acme/robotics/releases'
]){
 test('GitHub mapping refuses spoofed or non-repository URL '+value,async()=>{
  await assert.rejects(()=>githubReleases(claim({value}),async()=>{throw Error('Network should not be reached');}),/Invalid GitHub repository|repository/);
 });
}
test('GitHub fetch is origin-bound, nonredirecting and uses the official JSON API',async()=>{
 const calls=[];const found=await fetchMock([release()],calls);
 assert.equal(found.length,1);
 assert.equal(calls[0].address,'https://api.github.com/repos/acme/robotics/releases?per_page=30');
 assert.equal(calls[0].options.redirect,'error');
 assert.ok(calls[0].options.signal);
});
test('GitHub releases ignore unpublished drafts without creating signals',async()=>{
 const results=await fetchMock([release({draft:true}),release({id:124,published_at:null}),release()]);
 assert.equal(results.length,1);
 assert.equal(results[0].id,'123');
});
for(const response of [
 [null], [{}], [{id:null,draft:false,published_at:'2026-05-01',html_url:'https://github.com/acme/robotics/releases/tag/v1'}],
 [release({published_at:'2026-02-31'})], [release({html_url:'https://github.com/attacker/other/releases/tag/v1'})],
 [release({html_url:'https://evil.test/release/v1'})], [release({html_url:'https://github.com/acme/robotics/releases/tag/v1?spoof=true'})]
]){
 test('malformed or mismatched GitHub release is never exposed as verified '+JSON.stringify(response).slice(0,65),async()=>{
  const rows=await fetchMock(response);
  assert.deepEqual(rows,[]);
 });
}
test('official GitHub HTTP limits are surfaced instead of silently retrying or inventing events',async()=>{
 let calls=0;
 await assert.rejects(()=>githubReleases(claim(),async()=>{calls++;return new Response('{}',{status:429,headers:{'Retry-After':'60'}});}),/HTTP 429/);
 assert.equal(calls,1);
});
test('GitHub connector fails closed when official API response shape changes',async()=>{
 await assert.rejects(()=>githubReleases(claim(),async()=>new Response(JSON.stringify({message:'bad shape'}))),/Unexpected GitHub response/);
});
test('GitHub release storage refuses non-release URLs, invalid IDs, and invalid event dates',async()=>{
 const sample={id:'123',url:'https://github.com/acme/robotics/releases/tag/v1.0',name:'v1.0',description:'Repository release: v1.0',eventDate:'2026-05-01'};
 for(const bad of [{url:'https://github.com/acme/robotics/issues/23'},{url:'https://github.com.evil.test/acme/robotics/releases/tag/v1'}, {eventDate:'2026-02-31'}, {id:'../root'}, {description:' '}]){
  await assert.rejects(()=>releaseStatements('company',{...sample,...bad},'2026-11-03T12:00:00Z'),/release|event|source|date|ID|URL|Invalid/i);
 }
});
test('verified GitHub releases remain deduplicated and dated by original publication',async()=>{
 const d=new DatabaseSync(':memory:');d.exec('PRAGMA foreign_keys=ON');d.exec(readFileSync(new URL('../drizzle/0000_first_drax.sql',import.meta.url),'utf8'));
 for(const op of await recordStatements(records[0]))d.prepare(op.sql).run(...op.values);
 const r={id:'123',url:'https://github.com/acme/robotics/releases/tag/v1.0',name:'v1.0',description:'Repository release: v1.0',eventDate:'2026-05-01'};
 for(let i=0;i<2;i++)for(const op of await releaseStatements(records[0].slug,r,'2026-11-03T12:00:00Z'))d.prepare(op.sql).run(...op.values);
 assert.equal(d.prepare('SELECT count(*) n FROM signals').get().n,1);
 assert.equal(d.prepare('SELECT event_date FROM signals').get().event_date,'2026-05-01');
 assert.equal(d.prepare("SELECT count(*) n FROM evidence e JOIN claims c ON c.id=e.claim_id WHERE c.field='release' AND e.relationship='supports'").get().n,1);
 d.close();
});
