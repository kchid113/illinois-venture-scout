import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {assertProductionSeeds} from '../core/production-integrity.mjs';
const records=JSON.parse(readFileSync(new URL('../data/import.json',import.meta.url),'utf8'));
const profiles=JSON.parse(readFileSync(new URL('../data/profile-evidence.json',import.meta.url),'utf8'));
const copy=value=>structuredClone(value);

test('reviewed production import passes strict source and identity checks',()=>{
 const result=assertProductionSeeds(records,profiles);
 assert.deepEqual(result,{companies:29,reviewedProfiles:3});
 const uniqueIds=new Set(records.map(r=>r.slug));
 assert.equal(uniqueIds.size,records.length);
});

test('synthetic records cannot enter the reviewed production seed',()=>{
 const variants=[
  {name:'Synthetic Startup'},
  {name:'Demo Company'},
  {name:'Acme Example'},
  {name:'Test company'},
  {sourceUrl:'https://example.com/directory/'},
  {profile:'https://example.com/lanward/'},
  {affiliation:'University spinout'},
  {classification:'Verified factual'},
  {retrievedAt:'Not a date'},
  {excerpt:'Evidence for another company'},
  {website:'https://example.com'}
 ];
 for(const bad of variants){
  const changed=copy(records);
  changed[0]={...changed[0],...bad};
  assert.throws(()=>assertProductionSeeds(changed,profiles),/Production seed/);
 }
});

test('duplicate companies and invented profile evidence are rejected',()=>{
 const duplicate=copy(records);
 duplicate.push(copy(duplicate[0]));
 assert.throws(()=>assertProductionSeeds(duplicate,profiles),/duplicate/);
 const changedProfile=copy(profiles);
 changedProfile[0].slug='invented-profile';
 assert.throws(()=>assertProductionSeeds(records,changedProfile),/reviewed directory company/);
 const invalidWebsite=copy(profiles);
 invalidWebsite[0].website='https://example.com';
 assert.throws(()=>assertProductionSeeds(records,invalidWebsite),/placeholder official website/);
});

test('shipped production SQL contains only the reviewed companies, no test fixtures',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../drizzle/0000_first_drax.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../data/seed.sql',import.meta.url),'utf8'));
 const actual=db.prepare('SELECT id,name FROM companies ORDER BY id').all().map(x=>[x.id,x.name]);
 const expected=records.map(x=>[x.slug,x.name]).sort((a,b)=>a[0].localeCompare(b[0]));
 assert.deepEqual(actual,expected);
 assert.equal(db.prepare('SELECT count(*) n FROM companies').get().n,29);
 assert.equal(db.prepare('SELECT count(*) n FROM signals').get().n,0);
 assert.equal(db.prepare("SELECT count(*) n FROM claims WHERE field IN ('funding','revenue','valuation')").get().n,0);
 db.close();
});
