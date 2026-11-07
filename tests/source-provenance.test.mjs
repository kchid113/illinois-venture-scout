import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recordStatements,report,thesisFit,validCitations} from '../core/records.mjs';
import {founderOutreach,safeContactEmail,validatePrivateContact} from '../core/founder-outreach.mjs';
import {assertProductionSeeds} from '../core/production-integrity.mjs';
import {matchCompany} from '../core/source-candidates.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const seeds=JSON.parse(read('data/import.json'));
const profiles=JSON.parse(read('data/profile-evidence.json'));

test('original 29 reviewed companies and 3 audited profiles stay authentic',()=>{
 assert.deepEqual(assertProductionSeeds(seeds,profiles),{companies:29,reviewedProfiles:3});
 const catalog=JSON.parse(read('data/live-source-catalog.json'));
 assert.equal(catalog.additionalResearchParkNames.length,14);
 assert.equal(catalog.collection.candidateObservations,243);
 assert.equal(catalog.collection.sourceCollectionComplete,false);
 assert.equal(catalog.completeness,false);
});
test('source-backed PostgreSQL import statements use real IDs, upserts and evidence',async()=>{
 const ops=await recordStatements(seeds[0]);
 assert.ok(ops.some(x=>x.sql.includes('INSERT INTO companies(')&&x.sql.includes('GREATEST')));
 assert.ok(ops.some(x=>x.sql.includes('INSERT INTO evidence(')));
 assert.ok(ops.some(x=>x.sql.includes('ON CONFLICT DO NOTHING')));
 assert.ok(!ops.some(x=>x.sql.includes('INSERT OR IGNORE')));
 assert.equal(ops[0].values[0],seeds[0].slug);
});
test('reviewed source snapshot is PostgreSQL compatible and review candidates stay pending',()=>{
 const sql=read('data/catalog-additions.pg.sql');
 const statements=sql.split('\n').filter(x=>x&&!x.startsWith('--'));
 assert.equal(statements.filter(x=>x.startsWith('INSERT INTO source_candidates(')).length,243);
 assert.equal(statements.length,434);
 assert.ok(statements.every(x=>/^(INSERT INTO|UPDATE claims SET)/.test(x)));
 assert.ok(!sql.includes('BEGIN TRANSACTION;')&&!sql.includes('INSERT OR IGNORE'));
 assert.equal((sql.match(/'Pending'/g)||[]).length>=243,true);
});
test('company matching refuses duplicates or ambiguous identity',()=>{
 const rows=[{id:'one',name:'Alpha Labs'},{id:'two',name:'Alpha Labs'}];
 assert.equal(matchCompany('Alpha Labs',rows),null);
 assert.equal(matchCompany('Alpha Labs',[rows[0]])?.id,'one');
});
test('reports and thesis use original evidence, unknowns stay unknown',()=>{
 const c={id:seeds[0].slug,name:seeds[0].name,updated_at:seeds[0].retrievedAt,
  claims:[{id:'c',field:'sector',value:'AgTech',status:'Published',
   classification:'Verified factual',evidence:[{source_id:'s1',relationship:'supports',url:seeds[0].sourceUrl,publisher:'Research Park'}]}]};
 const markdown=report(c);
 assert.ok(markdown.includes(seeds[0].sourceUrl));
 assert.equal(validCitations(['not-present'],['s1']),false);
 const result=thesisFit(c,{sector:'AgTech'});
 assert.ok(result.score===null||Number.isFinite(result.score));
});
test('founder outreach is never invented and private contacts are bounded',()=>{
 const c={id:seeds[0].slug,name:seeds[0].name,profile:seeds[0].profile,claims:[]};
 const links=founderOutreach(c);
 assert.equal(links.direct.length,0);
 assert.equal(links.officialProfile,seeds[0].profile);
 assert.equal(safeContactEmail('bad@example.com\nBcc:evil@evil.com'),null);
 assert.equal(validatePrivateContact({name:'Founder intro',email:'founder@sample.org'}).name,'Founder intro');
});
