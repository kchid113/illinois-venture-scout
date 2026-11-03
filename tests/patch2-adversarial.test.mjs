import test from 'node:test';
import assert from 'node:assert/strict';
import {OFFICIAL_LISTINGS,officialHTML,parseNewsCandidates,parseOTMCandidates,parseIVentureCandidates,parseEnterpriseWorksCandidates,nihCandidates,usaSpendingCandidates} from '../core/source-adapters.mjs';
import {candidateStatements,matchCompany,normalizeCompanyName,mentionsCompany,newIVentureCompany,newEnterpriseWorksCompany} from '../core/source-candidates.mjs';

const at='2026-11-03T12:00:00.000Z';
const teams=[{id:'forge',name:'Forge'},{id:'forgebee',name:'ForgeBee'},{id:'acme',name:'Acme Science'},{id:'nova',name:'Nova Labs'}];
const news=(name,href='https://researchpark.illinois.edu/story/',dt='2026-11-03')=>'<article><h2><a href="'+href+'">'+name+'</a></h2><time datetime="'+dt+'"></time></article>';
const entry=(name,href,types=['EnterpriseWorks Incubator','Tenant Directory'])=>'<article>'+types.map(c=>'<a rel="category tag">'+c+'</a>').join('')+'<h2 class="entry-title"><a href="'+href+'">'+name+'</a></h2></article>';
const validCandidate=(overrides={})=>({connector:'iventure-cohorts',externalId:'cohort-11:nova-labs',sourceUrl:OFFICIAL_LISTINGS['iventure-cohorts'].url,
 title:'Nova Labs — iVenture cohort 11',publisher:'iVenture Accelerator',excerpt:'Official cohort 11 names Nova Labs',
 companyName:'Nova Labs',companyId:'nova',eventDate:null,payload:{cohort:11,ventureWebsite:'https://nova.example.org/'},...overrides});

test('normalized identity does not treat suffix, partial word, and ambiguity as exact matches',()=>{
 assert.equal(matchCompany('Forge Labs',teams),null);
 assert.equal(mentionsCompany('ForgeBee accelerates', 'Forge'),false);
 assert.equal(mentionsCompany('ForgeBee accelerates', 'ForgeBee'),true);
 assert.equal(matchCompany('NOVA   LABS',teams)?.id,'nova');
 assert.equal(matchCompany('Nova Labs',[...teams,{id:'doppelganger',name:'Nova Labs'}]),null);
 assert.equal(normalizeCompanyName('  Nova---Labs   '),'nova labs');
});
for(const [label,html] of [
 ['nav-only match','<nav><a>Acme Science</a></nav><main><h2>OTM portfolio</h2><p>Different University startup</p></main>'],
 ['unrelated footer','<footer>Nova Labs</footer><h2>Portfolio members</h2><p>Other company</p>'],
 ['keyword mention outside a startup record','<h2>News</h2><p>Forge is one of our sponsors</p>']
]){
 test('OTM avoids unsupported company identity from '+label,()=>{
  assert.deepEqual(parseOTMCandidates(html,teams,at),[]);
 });
}
test('OTM can use a distinct official startup directory row as an evidence candidate',()=>{
 const html='<article class="startup"><h3><a href="https://otm.illinois.edu/startups/nova-labs">Nova Labs</a></h3></article>';
 assert.equal(parseOTMCandidates(html,teams,at).length,1);
});
for(const [label,href] of [
 ['offsite','https://example.com/bogus'],
 ['HTTP downgrade','http://researchpark.illinois.edu/story/'],
 ['credentials','https://user:pass@researchpark.illinois.edu/story/'],
 ['query-bearing URL','https://researchpark.illinois.edu/story/?utm_source=x'],
 ['fragment URL','https://researchpark.illinois.edu/story/#x']
]){
 test('news parser rejects '+label+' instead of citing an altered URL',()=>{
  assert.equal(parseNewsCandidates(news('Nova Labs wins award',href),'research-park-news',teams,at).length,0);
 });
}
test('news parser does not conflate similar company names, unlinked titles, or secondary content',()=>{
 assert.equal(parseNewsCandidates(news('ForgeBee wins research prize'),'research-park-news',teams,at)[0].companyId,'forgebee');
 assert.equal(parseNewsCandidates('<article><h2>Nova Labs technology</h2><a href="https://researchpark.illinois.edu/story/">Read</a></article>','research-park-news',teams,at).length,0);
 assert.equal(parseNewsCandidates(news('Any startup wins'),'research-park-news',teams,at).length,0);
});
for(const bad of ['2026-02-31','2026-13-01','2026-00-01','unreleased']){
 test('invalid news event date '+bad+' stays unknown',()=>{
  const a=parseNewsCandidates(news('Nova Labs wins award',undefined,bad),'research-park-news',teams,at);
  assert.equal(a.length,1);
  assert.equal(a[0].eventDate,null);
 });
}
test('duplicate news URL deduplicates and missing article date cannot fabricate a development',()=>{
 const a=parseNewsCandidates(news('Nova Labs wins award')+news('Nova Labs wins award'),'research-park-news',teams,at);
 assert.equal(a.length,1);
 const b=parseNewsCandidates(news('Nova Labs wins award',undefined,''),'research-park-news',teams,at);
 assert.equal(b[0].eventDate,null);
});
test('iVenture does not infer equity ownership or university investment from cohort membership',()=>{
 const html='<h3>iVenture 11</h3><h4>Nova Labs</h4><p>Company founded by students</p>';
 const rows=parseIVentureCandidates(html,teams,at);
 assert.equal(rows.length,1);
 assert.equal(rows[0].payload.recordType,'iventure-cohort');
 assert.ok(!('funding' in rows[0].payload));
 assert.ok(!('universityOwned' in rows[0].payload));
});
for(const bad of ['https://localhost/private/','https://127.0.0.1/admin','http://nova.example.org/','https://user:pw@nova.example.org/']){
 test('iVenture new venture cannot use unsafe website '+bad,async()=>{
  const candidate={...validCandidate({companyId:null}),company_id:null,company_name:'Nova Labs',payload:JSON.stringify({cohort:11,ventureWebsite:bad}),status:'Pending'};
  await assert.rejects(()=>newIVentureCompany(candidate,at),/Untrusted company website/);
 });
}
test('iVenture parser prevents headings outside cohorts from becoming ventures',()=>{
 const html='<h2>Startups by Cohort</h2><h3>iVenture 11</h3><h4>Nova Labs</h4><h2>Alumni Profiles</h2><h4>Other startup</h4>';
 const a=parseIVentureCandidates(html,teams,at);
 assert.deepEqual(a.map(x=>x.companyName),['Nova Labs']);
});
for(const href of ['https://evil.test/tenant/','http://researchpark.illinois.edu/tenant/','https://researchpark.illinois.edu/','https://researchpark.illinois.edu/category/tenant-directory/startup/']){
 test('EnterpriseWorks parser excludes noncanonical company profile '+href,()=>{
  assert.throws(()=>parseEnterpriseWorksCandidates(entry('Nova Labs',href),teams,at),/no qualifying tagged records/);
 });
}
test('EnterpriseWorks rejects wrong tag combination and duplicate source rows',()=>{
 const html=entry('Nova Labs','https://researchpark.illinois.edu/nova-labs/', ['Tenant Directory','Startup']);
 assert.throws(()=>parseEnterpriseWorksCandidates(html,teams,at),/no qualifying tagged records/);
 const valid=entry('Nova Labs','https://researchpark.illinois.edu/nova-labs/');
 assert.equal(parseEnterpriseWorksCandidates(valid+valid,teams,at).length,1);
});
test('EnterpriseWorks page citation requires exactly canonical directory page',()=>{
 const html=entry('Nova Labs','https://researchpark.illinois.edu/nova-labs/');
 for(const url of ['https://evil.test/other/','https://researchpark.illinois.edu/category/tenant-directory/enterpriseworks-incubator/page/999/','https://researchpark.illinois.edu/category/tenant-directory/enterpriseworks-incubator/?fake=1']){
  assert.throws(()=>parseEnterpriseWorksCandidates(html,teams,at,url),/Unexpected EnterpriseWorks listing page/);
 }
});
test('EnterpriseWorks reviewed company creation refuses untrusted profile and malformed venture name',async()=>{
 const base={...validCandidate(),connector:'enterpriseworks-directory',status:'Pending',company_id:null,company_name:'Nova Labs',payload:JSON.stringify({profileUrl:'https://researchpark.illinois.edu/nova-labs/'})};
 await assert.rejects(()=>newEnterpriseWorksCompany({...base,payload:JSON.stringify({profileUrl:'https://researchpark.illinois.edu.evil.test/nova-labs/'})},at),/Research Park official profile/);
 await assert.rejects(()=>newEnterpriseWorksCompany({...base,company_name:'<script>alert(1)</script>'},at),/Unreviewable/);
});
test('NIH returns no award when exact organization identity mismatches',async()=>{
 const fake=async()=>new Response(JSON.stringify({results:[{appl_id:22,organization:{org_name:'Nova Labs International'},award_amount:800}]}));
 assert.equal((await nihCandidates(teams[3],'Nova Labs',at,fake)).length,0);
});
test('NIH malformed rows, invalid IDs, and missing organization objects are ignored',async()=>{
 const fake=async()=>new Response(JSON.stringify({results:[null,{}, {appl_id:'123e2',organization:{org_name:'Nova Labs'}},{appl_id:0,organization:{org_name:'Nova Labs'}},{appl_id:123,organization:{org_name:'Nova Labs'}}]}));
 const a=await nihCandidates(teams[3],'Nova Labs',at,fake);
 assert.equal(a.length,1);
 assert.equal(a[0].externalId,'123');
});
for(const amount of [-5,Number.NaN,Number.POSITIVE_INFINITY,null]){
 test('NIH invalid amount '+String(amount)+' is not treated as a legitimate award',async()=>{
  const fake=async()=>new Response(JSON.stringify({results:[{appl_id:123,project_title:'Project',organization:{org_name:'Nova Labs'},award_amount:amount}]}));
  const a=await nihCandidates(teams[3],'Nova Labs',at,fake);
  assert.equal(a[0].payload.awardAmount,null);
  assert.ok(a[0].excerpt.includes('Award amount not stated'));
 });
}
test('USAspending rejects malformed recipients and invalid amount but retains exact UEI',async()=>{
 const uei='ABCDEF123456';
 const fake=async()=>new Response(JSON.stringify({results:[null,{}, {'Recipient UEI':uei,'Award ID':'A1',generated_internal_id:'id1','Award Amount':-3},
 {'Recipient UEI':'WRONG123456','Award ID':'A2',generated_internal_id:'id2','Award Amount':3}]}));
 const a=await usaSpendingCandidates(teams[3],uei,at,fake);
 assert.equal(a.length,1);
 assert.equal(a[0].payload.amount,null);
});
for(const body of ['invalid json',JSON.stringify({results:'wrong shape'}),JSON.stringify({results:null})]){
 test('official API refuses malformed upstream payload rather than making claims',async()=>{
  const fake=async()=>new Response(body);
  await assert.rejects(()=>nihCandidates(teams[3],'Nova Labs',at,fake));
 });
}
test('official HTML connector blocks disallowed robots and never fetches restricted page',async()=>{
 const calls=[];
 const fetcher=async url=>{calls.push(url);return new Response('User-agent: *\nDisallow: /');};
 await assert.rejects(()=>officialHTML('iventure-cohorts',fetcher),/robots policy/);
 assert.equal(calls.length,1);
});
for(const status of [403,429,503]){
 test('official HTML connector fails closed on source denial '+status,async()=>{
  let calls=0;const fetcher=async url=>{calls++;return new Response('',{status});};
  await assert.rejects(()=>officialHTML('iventure-cohorts',fetcher));
  assert.equal(calls,1);
 });
}
test('official HTML rejects unsupported page enumeration before network calls',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return new Response('');};
 for(const page of [0,-1,1.5,7,NaN,'2']){
  await assert.rejects(()=>officialHTML('enterpriseworks-directory',fetcher,{page}),/Unsupported source listing page/);
 }
 assert.equal(calls,0);
});
test('source candidate URLs enforce allowed origin and canonical paths',async()=>{
 for(const overrides of [
  {sourceUrl:'http://iventure.illinois.edu/startups'},
  {sourceUrl:'https://iventure.illinois.edu.evil.test/startups'},
  {sourceUrl:'https://user:pass@iventure.illinois.edu/startups'},
  {sourceUrl:'https://iventure.illinois.edu/startups#fake'},
  {sourceUrl:'https://iventure.illinois.edu/other-page'},
 ]){
  await assert.rejects(()=>candidateStatements(validCandidate(overrides),at),/source|Source|canonical|allowlist|connector/);
 }
});
