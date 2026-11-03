import test from 'node:test';
import assert from 'node:assert/strict';
import {safeUrl,parseDirectory,fetchText,assertRobots,directoryUrl,text} from '../core/ingestion.mjs';

const time='2026-11-03T12:00:00.000Z';
const article=(name='Nova Labs',href='https://researchpark.illinois.edu/nova-labs/',cats=['Startup','Tenant Directory'],description='Nova Labs 60 Hazelwood Drive Nova Labs makes advanced robotics for local industries.')=>
 '<article>'+cats.map(c=>'<a rel="category tag">'+c+'</a>').join('')+
 '<h2 class="entry-title"><a href="'+href+'">'+name+'</a></h2><p>'+description+'</p></article>';
const parse=html=>parseDirectory(html,directoryUrl,time);
test('canonical directory parses a source-backed startup and only permitted program classifications',()=>{
 const r=parse(article());assert.equal(r.length,1);
 assert.equal(r[0].name,'Nova Labs');assert.equal(r[0].affiliation,'Research Park tenant');
 assert.equal(r[0].profile,'https://researchpark.illinois.edu/nova-labs/');
 assert.equal(r[0].sourceUrl,directoryUrl);
 assert.equal(r[0].publicationDate,null);
 assert.equal(r[0].website,null);
});
for(const [name,href] of [
 ['non-official external company','https://evil.test/nova-labs/'],
 ['external lookalike host','https://researchpark.illinois.edu.evil.test/nova-labs/'],
 ['plaintext profile URL','http://researchpark.illinois.edu/nova-labs/'],
 ['credentialed profile','https://foo:bar@researchpark.illinois.edu/nova-labs/'],
 ['query-bearing profile','https://researchpark.illinois.edu/nova-labs/?redirect=evil'],
 ['fragment-bearing profile','https://researchpark.illinois.edu/nova-labs/#fake'],
 ['directory path used as company profile','https://researchpark.illinois.edu/category/tenant-directory/startup/'],
 ['website homepage used as profile','https://researchpark.illinois.edu/'],
]){
 test('directory rejects '+name,()=>{
  assert.throws(()=>parse(article('Nova Labs',href)),/URL|profile|directory|canonical|eligible/);
 });
}
for(const cats of [
 ['Startup'],['Tenant Directory'],['Corporate Site','Tenant Directory'],['News','Startup'],[]
]){
 test('directory never imports non-startup categories '+cats.join(','),()=>{
  assert.throws(()=>parse(article('Nova Labs',undefined,cats)),/No eligible/);
 });
}
test('incubator categories do not imply university equity, spinout or any startup funding',()=>{
 const r=parse(article('Nova Labs',undefined,['Startup','Tenant Directory','EnterpriseWorks Incubator']));
 assert.equal(r[0].affiliation,'EnterpriseWorks incubator participant');
 assert.equal(r[0].sector,null);
 assert.equal(r[0].website,null);
});
test('directory excludes unrelated article news from the company description',()=>{
 const r=parse(article('Nova Labs',undefined,undefined,
  'Nova Labs 60 Hazelwood Drive Nova Labs provides AI-enabled tools to growers. In The News: Raised $10M.'));
 assert.ok(!r[0].description.includes('$10M'));
 assert.ok(r[0].description.includes('growers'));
});
for(const [name,source] of [
 ['offsite directory','https://attacker.test/category/tenant-directory/startup/'],
 ['off-program official site','https://researchpark.illinois.edu/news/'],
 ['invalid category page','https://researchpark.illinois.edu/category/tenant-directory/corporate/'],
 ['unbounded page','https://researchpark.illinois.edu/category/tenant-directory/startup/page/99999/']
]){
 test('directory parser refuses source outside official bounded listing: '+name,()=>{
  assert.throws(()=>parseDirectory(article(),source,time),/directory|source|URL|page/);
 });
}
test('parser never publishes a company when no eligible article evidence exists',()=>{
 assert.throws(()=>parse('<header>Nova Labs</header><footer><a>Startup</a></footer>'),/No eligible/);
});
test('HTML decoder supports numeric and named entities without crashing on invalid codepoints',()=>{
 assert.equal(text('A&nbsp;B &amp; C &#8217;'),'A B & C ’');
 assert.doesNotThrow(()=>text('A &#999999999999; B &#x110000;'));
});
for(const url of [
 'https://researchpark.illinois.edu/?x=1',
 'https://researchpark.illinois.edu/#not-the-original',
 'https://researchpark.illinois.edu:8443/',
 'https://researchpark.illinois.edu.evil.test/',
 'http://researchpark.illinois.edu/',
 'https://user:pw@researchpark.illinois.edu/',
 'https://localhost/'
]){
 test('canonical safeUrl rejects tampered URL '+url,()=>assert.throws(()=>safeUrl(url),/allowlist|canonical|URL/i));
}
test('safeUrl permits a genuine official profile without changing its URL',()=>{
 assert.equal(safeUrl('https://researchpark.illinois.edu/nova-labs/'),'https://researchpark.illinois.edu/nova-labs/');
});
for(const status of [403,429,404,502]){
 test('source restrictions and upstream errors fail closed: '+status,async()=>{
  let calls=0;const fetcher=async()=>{calls++;return new Response('restricted',{status})};
  await assert.rejects(()=>fetchText(directoryUrl,fetcher,{wait:async()=>{}}),/Source restricted|Source HTTP/);
  // 502 will be retried; this is tested separately with a fake instantaneous clock.
  assert.equal(calls,status>=500?3:1);
 });
}
test('fetchText enforces bounds and redirects even when HTTP response is successful',async()=>{
 let opts;await assert.rejects(()=>fetchText(directoryUrl,async(_,o)=>{opts=o;return new Response('x'.repeat(2_500_001));}),/size limit/);
 assert.equal(opts.redirect,'error');
 assert.ok(opts.signal);
});
test('robots disallow for the requested directory overrides a permissive unrelated agent group',async()=>{
 const fetcher=async()=>new Response('User-agent: *\nDisallow: /category/tenant-directory/startup/\nUser-agent: OtherBot\nAllow: /\n');
 await assert.rejects(()=>assertRobots(fetcher),/Robots policy/);
});
test('robots disallow for a different path should not block directory',async()=>{
 const fetcher=async()=>new Response('User-agent: *\nDisallow: /admin/\n');
 assert.equal(await assertRobots(fetcher),10000);
});
test('robots parser respects the relevant user-agent group, not unrelated bots',async()=>{
 const fetcher=async()=>new Response('User-agent: OtherBot\nDisallow: /\nUser-agent: *\nAllow: /\n');
 assert.equal(await assertRobots(fetcher),10000);
});
test('robots allows a more specific directory exception to a broad disallow rule',async()=>{
 const fetcher=async()=>new Response('User-agent: *\nDisallow: /\nAllow: /category/tenant-directory/startup/\n');
 assert.equal(await assertRobots(fetcher),10000);
});
test('robots lookup fails closed when unavailable, rather than assuming permission',async()=>{
 await assert.rejects(()=>assertRobots(async()=>new Response('',{status:404})),/Source HTTP/);
});
for(const n of [0,-1,1.5,NaN,6,'2',null]){
 test('directory pagination rejects invalid page count '+String(n),async()=>{
  let calls=0;const fetcher=async()=>{calls++;return new Response('User-agent: *\nAllow: /\n')};
  const {collectDirectory}=await import('../core/ingestion.mjs');
  await assert.rejects(()=>collectDirectory({pages:n,fetcher}),/page|range|count/);
  assert.equal(calls,0);
 });
}
