import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {indexCompanyClaims} from '../core/company-claim-index.mjs';

test('batched projection preserves source evidence, ordering, contradictions and missing companies',()=>{
 const claims=[
  {id:'claim-b',company_id:'b',field:'sector',value:'AgTech'},
  {id:'claim-a1',company_id:'a',field:'description',value:'A product'},
  {id:'claim-a2',company_id:'a',field:'sector',value:'Software'}
 ];
 const evidence=[
  {id:'support-1',claim_id:'claim-a1',relationship:'supports',publisher:'Official source'},
  {id:'conflict-1',claim_id:'claim-a1',relationship:'contradicts',publisher:'Independent source'},
  {id:'support-2',claim_id:'claim-b',relationship:'supports',publisher:'Official source'},
  {id:'unused',claim_id:'not-in-claims',relationship:'supports'}
 ];
 const r=indexCompanyClaims(['a','b','c'],claims,evidence);
 assert.deepEqual([...r.keys()],['a','b','c']);
 assert.deepEqual(r.get('a').map(x=>x.id),['claim-a1','claim-a2']);
 assert.equal(r.get('a')[0].evidence.length,2);
 assert.deepEqual(r.get('a')[0].evidence.map(x=>x.relationship),['supports','contradicts']);
 assert.deepEqual(r.get('a')[1].evidence,[]);
 assert.deepEqual(r.get('b')[0].evidence.map(x=>x.id),['support-2']);
 assert.deepEqual(r.get('c'),[]);
 assert.equal(claims[1].evidence,undefined,'source claim objects must remain unchanged');
});

test('batched projection does not attribute a claim to an unrequested company',()=>{
 const r=indexCompanyClaims(['known'],[{id:1,company_id:'other',value:'not authorized'}],[]);
 assert.deepEqual(r.get('known'),[]);
 assert.equal(r.has('other'),false);
 assert.deepEqual([...indexCompanyClaims([],[],[]).entries()],[]);
});

test('public research reads no longer perform per-record nested queries',()=>{
 const src=readFileSync(new URL('../lib/radar.ts',import.meta.url),'utf8');
 assert.match(src,/async function claimsForMany/);
 assert.match(src,/indexCompanyClaims/);
 assert.match(src,/claimsForMany\(rows\.map/);
 assert.doesNotMatch(src,/rows\.map\(async c=>/);
 assert.doesNotMatch(src,/claims\.map\(async c=>/);
});

test('only shared public read responses receive short CDN caching',()=>{
 const src=readFileSync(new URL('../app/api/data/route.ts',import.meta.url),'utf8');
 assert.match(src,/s-maxage=60/);
 assert.match(src,/stale-while-revalidate=120/);
 assert.match(src,/view==='workspace'.*status:403/);
 assert.match(src,/headers:publicCache/);
 assert.doesNotMatch(src,/NEXT_PUBLIC_DATABASE_URL/);
});
