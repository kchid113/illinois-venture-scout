import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDirectory,safeUrl,fetchText} from '../core/ingestion.mjs';
import {matchCompany,normalizeCompanyName,STARTUP_CATALOG_CONNECTORS} from '../core/source-candidates.mjs';
import {parseEnterpriseWorksCandidates} from '../core/source-adapters.mjs';
import {founderOutreach,validatePrivateContact,safeContactWebsite,safeContactEmail} from '../core/founder-outreach.mjs';
import {thesisFit,csv} from '../core/records.mjs';

const observed='2026-11-01T00:00:00.000Z';
const source='https://researchpark.illinois.edu/category/tenant-directory/startup/';
const markup=(categories,slug='alpha')=>
 `<article><h2 class="entry-title"><a href="https://researchpark.illinois.edu/${slug}/">Alpha Technology</a></h2>
 ${categories.map(c=>`<a rel="category tag">${c}</a>`).join('')}
 <p>Alpha Technology builds industrial software.</p></article>`;
test('only official Startup and Tenant Directory taxonomy qualifies for direct Research Park import',()=>{
 const html=markup(['Tenant Directory','Startup'])+markup(['Startup','News'],'news')+
  markup(['Tenant Directory','Corporate'],'corporate');
 const records=parseDirectory(html,source,observed);
 assert.equal(records.length,1);
 assert.equal(records[0].slug,'alpha');
 assert.equal(records[0].affiliation,'Research Park tenant');
});
test('EnterpriseWorks affiliation is distinct from university equity or backing',()=>{
 const records=parseDirectory(markup(['Tenant Directory','Startup','EnterpriseWorks Incubator']),source,observed);
 assert.equal(records[0].affiliation,'EnterpriseWorks incubator participant');
 assert.ok(!records[0].affiliation.includes('spinout'));
});
test('blocked websites and unsafe URLs are never fetched as trusted company sources',async()=>{
 for(const url of ['http://researchpark.illinois.edu/','https://127.0.0.1/secret',
  'https://localhost/','https://researchpark.illinois.edu.evil.net/',
  'https://attacker:pw@researchpark.illinois.edu/'])
  assert.throws(()=>safeUrl(url));
 let count=0;
 await assert.rejects(()=>fetchText(source,async()=>{count++;return new Response('',{status:403});}),/restricted/);
 assert.equal(count,1);
});
test('EnterpriseWorks directory names are observations, not automatic authorized startup claims',()=>{
 const html=markup(['EnterpriseWorks Incubator','Tenant Directory']);
 const candidates=parseEnterpriseWorksCandidates(html,[],observed);
 assert.equal(Array.isArray(candidates),true);
 assert.ok(candidates.every(c=>c.connector==='enterpriseworks-directory'));
});
test('normalization never authorizes ambiguous exact-name identity matches',()=>{
 assert.equal(normalizeCompanyName(' Acme-Labs, Inc. '),'acme labs inc');
 assert.equal(matchCompany('Acme Labs',[{id:'a',name:'Acme Labs'},{id:'b',name:'Acme Labs'}]),null);
 assert.equal(matchCompany('Unknown Corp',[{id:'a',name:'Acme Labs'}]),null);
 assert.equal(STARTUP_CATALOG_CONNECTORS.includes('otm-startups'),true);
});
test('source-verified founder email creates a direct link, not an inferred one',()=>{
 const verified={id:'claim',field:'founder email',value:'founder@startup.org',
  status:'Published',classification:'Verified factual',
  evidence:[{source_id:'original',relationship:'supports',url:'https://researchpark.illinois.edu/alpha/'}]};
 const c={id:'alpha',name:'Alpha',profile:'https://researchpark.illinois.edu/alpha/',claims:[verified]};
 assert.deepEqual(founderOutreach(c).direct.map(v=>v.url),['mailto:founder@startup.org']);
 assert.equal(founderOutreach({...c,claims:[{...verified,status:'Pending'}]}).direct.length,0);
 assert.equal(founderOutreach({...c,claims:[{...verified,evidence:[]}]}).direct.length,0);
});
test('founder contact links reject control characters, invalid protocols and private hosts',()=>{
 assert.equal(safeContactEmail('alice@example.org\nBcc:evil@example.org'),null);
 assert.equal(safeContactEmail('mailto:alice@example.org'),null);
 assert.equal(safeContactWebsite('javascript:alert(1)'),null);
 assert.equal(safeContactWebsite('https://localhost/private'),null);
 assert.equal(validatePrivateContact({name:'Research context',notes:'Warm introduction'}).name,'Research context');
 assert.throws(()=>validatePrivateContact({name:'A',email:'bad@@example.org'}));
});
test('screening with insufficient evidence withholds predictions',()=>{
 const none=thesisFit({claims:[]},{sector:'AgTech',keywords:'robotics'});
 assert.equal(none.score,null);
 assert.equal(none.coverage,0);
});
test('CSV exports neutralize spreadsheet formula injection',()=>{
 for(const prefix of ['=','+','-','@']){
  const output=csv([[prefix+'1+1']]);
  assert.ok(output.includes("'"+prefix));
 }
});
