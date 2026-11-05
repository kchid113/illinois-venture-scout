import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {founderOutreach,validatePrivateContact,parsePrivateContact,safeContactEmail,safeContactWebsite} from '../core/founder-outreach.mjs';

const evidence=[{source_id:'research-page',relationship:'supports',url:'https://researchpark.illinois.edu/alpha/',last_checked:'2026-11-04'}];
const claim=(field,value,overrides={})=>({id:field+':'+value,field,value,status:'Published',classification:'Verified factual',evidence,...overrides});
const company=claims=>({id:'alpha',name:'Alpha',profile:'https://researchpark.illinois.edu/alpha/',claims});

test('all source-backed startup pages show a truthful official contact starting point',()=>{
 const contact=founderOutreach(company([claim('description','Sourced description')]));
 assert.equal(contact.direct.length,0);
 assert.equal(contact.founders.length,0);
 assert.equal(contact.officialProfile,'https://researchpark.illinois.edu/alpha/');
 assert.equal(contact.website,null);
 assert.equal(contact.hasDirect,false);
});
test('a verified founder identity is a name, not fabricated personal contact data',()=>{
 const contact=founderOutreach(company([claim('founder','Dr. Ada Founder')]));
 assert.deepEqual(contact.founders.map(c=>c.value),['Dr. Ada Founder']);
 assert.equal(contact.direct.length,0);
});
test('only explicitly sourced and published personal contact claims create direct mailto and profile actions',()=>{
 const rows=[
  claim('founder email','ada@alpha.io'),
  claim('founder linkedin','https://www.linkedin.com/in/ada-founder/'),
  claim('website','https://alpha.io/'),
  claim('founder email','private@alpha.io',{status:'Pending'}),
  claim('founder contact','unsourced@alpha.io',{evidence:[]}),
  claim('founder email','unrelated@alpha.io',{evidence:[{source_id:'x',relationship:'contradicts',url:'https://researchpark.illinois.edu/alpha/'}]}),
  claim('founder email','newlines@alpha.io%0ABcc:evil@x.org')
 ];
 const contact=founderOutreach(company(rows));
 assert.deepEqual(contact.direct.map(c=>c.url),['mailto:ada@alpha.io','https://www.linkedin.com/in/ada-founder/']);
 assert.equal(contact.website,'https://alpha.io/');
 assert.equal(contact.verifiedSourceCount,1);
 assert.equal(contact.hasDirect,true);
});
test('unsafe/ambiguous contact strings never become clickable hyperlinks',()=>{
 for(const bad of [
 'alice@example.com\nBcc:bob@example.com','mailto:alice@example.com','alice@localhost',
 'alice@example.com?subject=hello',' user@example.com','alice@@example.com'
 ])assert.equal(safeContactEmail(bad),null,bad);
 for(const bad of [
 'javascript:alert(1)','data:text/html,hi','file:///etc/passwd','http://example.org/',
 'https://localhost/','https://127.0.0.1/private','https://admin:pass@site.example.org/',
 'https://site.example.org/?redirect=evil','https://example.test/'
 ])assert.equal(safeContactWebsite(bad),null,bad);
 assert.equal(safeContactEmail('founder@company.org'),'founder@company.org');
 assert.equal(safeContactWebsite('https://www.linkedin.com/in/founder/'),'https://www.linkedin.com/in/founder/');
});
test('private founder records are validated, do not become public claims, and allow reachable user-supplied contacts',()=>{
 const data=validatePrivateContact({name:'Investor introduction',email:'founder@alpha.io',
  profile:'https://www.linkedin.com/in/alpha/',notes:'Met at Demo Day'});
 assert.deepEqual(data,{name:'Investor introduction',email:'founder@alpha.io',
  profile:'https://www.linkedin.com/in/alpha/',notes:'Met at Demo Day'});
 assert.deepEqual(parsePrivateContact(JSON.stringify(data)),data);
 for(const bad of [
 {name:'Name',email:'bad-value'},
 {name:'Name',profile:'http://localhost/admin'},
 {name:'',email:'',profile:'',notes:''},
 {name:'A',notes:'A'.repeat(751)}
 ])assert.throws(()=>validatePrivateContact(bad));
 assert.equal(parsePrivateContact('{invalid'),null);
});
test('founder contacts stay in account-scoped workspace and are never shared across investors',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(readFileSync(new URL('../drizzle/0000_first_drax.sql',import.meta.url),'utf8'));
  const save=db.prepare('INSERT INTO workspace(id,user_id,kind,key,value,updated_at) VALUES(?,?,?,?,?,?)');
  const a=JSON.stringify(validatePrivateContact({name:'First private contact',email:'founder@alpha.io'}));
  const b=JSON.stringify(validatePrivateContact({name:'Second private contact',email:'other@alpha.io'}));
  save.run('a','investor-one','contact','alpha',a,'2026-11-04');
  save.run('b','investor-two','contact','alpha',b,'2026-11-04');
  assert.equal(JSON.parse(db.prepare('SELECT value FROM workspace WHERE user_id=? AND kind=?').get('investor-one','contact').value).name,'First private contact');
  assert.equal(JSON.parse(db.prepare('SELECT value FROM workspace WHERE user_id=? AND kind=?').get('investor-two','contact').value).name,'Second private contact');
  assert.equal(db.prepare("SELECT count(*) n FROM claims").get().n,0);
 }finally{db.close();}
});
test('UI and API enforce the founder contact boundary and use the live company profile',()=>{
 const api=readFileSync(new URL('../app/api/data/route.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../components/company-overview.tsx',import.meta.url),'utf8');
 const radar=readFileSync(new URL('../components/radar.tsx',import.meta.url),'utf8');
 assert.match(api,/validatePrivateContact\(JSON\.parse\(x\.value\)\)/);
 assert.match(api,/contact/);
 assert.match(ui,/founder-contact/);
 assert.match(ui,/founderOutreach\(company\)/);
 assert.match(ui,/Direct|direct/);
 assert.match(radar,/privateContact=\{item\('contact',selectedCompany\.id\)\}/);
 assert.match(radar,/href="#founder-contact"/);
 assert.ok(!ui.includes('fake@')&&!ui.includes('founder@example.com'));
});
