import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {reconcileCatalogs,renderSQL} from '../core/catalog-snapshot.mjs';

const time='2026-11-04T12:00:00.000Z';
const original=[{slug:'acme',name:'Acme Labs',profile:'https://researchpark.illinois.edu/acme/'}];
const checks=[
 {connector:'research-park-4',status:'collected',count:1},
 {connector:'otm-startups',status:'collected',count:2},
 {connector:'iventure-cohorts',status:'collected',count:1}
];
const obs=(name,connector,extra={})=>({name,connector,sourceUrl:connector.startsWith('research-park-')
 ?'https://researchpark.illinois.edu/category/tenant-directory/startup/page/4/':
 connector==='otm-startups'?'https://otm.illinois.edu/browse-technologies-startups/startups':
 'https://iventure.illinois.edu/startups',...extra});

test('live source observations reconcile duplicates by exact normalized name without auto-publishing',()=>{
 const result=reconcileCatalogs({seed:original,observedAt:time,sourceChecks:checks,observations:[
  obs('Acme Labs','otm-startups'),obs('   ACME---LABS  ','iventure-cohorts'),
  obs('New Venture','research-park-4',{slug:'new-venture',profile:'https://researchpark.illinois.edu/new-venture/'}),
  obs('New Venture','otm-startups')
 ]});
 assert.equal(result.uniqueNormalizedNames,2);
 assert.equal(result.sourceObservations,4);
 assert.equal(result.completeness,true);
 const existing=result.companies.find(x=>x.normalizedName==='acme labs');
 assert.equal(existing.existingSeedCompanyId,'acme');
 assert.equal(existing.sourceObservations.length,2);
 const newOne=result.companies.find(x=>x.normalizedName==='new venture');
 assert.equal(newOne.existingSeedCompanyId,null);
 assert.equal(newOne.manualIdentityReview,true);
 assert.equal(result.additionalResearchParkNames.length,1);
 assert.equal(result.additionalResearchParkNames[0].slug,'new-venture');
});
test('source directory identity conflicts require review before any import statements are prepared',()=>{
 const catalog=reconcileCatalogs({seed:original,observedAt:time,sourceChecks:checks,observations:[
  obs('Acme Labs Renamed','research-park-4',{slug:'acme',profile:'https://researchpark.illinois.edu/acme/'})
 ]});
 assert.equal(catalog.additionalResearchParkNames.length,0);
 assert.equal(catalog.sourceIdentityConflicts.length,1);
 assert.equal(catalog.sourceIdentityConflicts[0].slug,'acme');
});
test('partial source checks never claim an exhaustive ecosystem census',()=>{
 const result=reconcileCatalogs({seed:original,observedAt:time,sourceChecks:[
  ...checks,{connector:'enterpriseworks-directory',status:'failed',count:0,error:'HTTP 429'}
 ],observations:[obs('New Venture','otm-startups')]});
 assert.equal(result.completeness,false);
 assert.equal(result.uniqueNormalizedNames,1);
});
test('SQL renders values with safe quoting and preserves idempotent source statements',()=>{
 const sql=renderSQL([{sql:'INSERT OR IGNORE INTO example(name,amount,note) VALUES(?,?,?)',
 values:["O'Malley LLC",null,'A ? literal and -- comment text']}]);
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE example (name TEXT PRIMARY KEY,amount REAL,note TEXT)');
  db.exec(sql);db.exec(sql);
  const r=db.prepare('SELECT * FROM example').get();
  assert.equal(r.name,"O'Malley LLC");
  assert.equal(r.amount,null);
  assert.equal(r.note,'A ? literal and -- comment text');
  assert.equal(db.prepare('SELECT count(*) n FROM example').get().n,1);
 }finally{db.close();}
 assert.throws(()=>renderSQL([{sql:'SELECT ?',values:[]}]),/placeholder/);
 assert.throws(()=>renderSQL([{sql:'SELECT ?',values:[{}]}]),/Unexpected SQL/);
});
