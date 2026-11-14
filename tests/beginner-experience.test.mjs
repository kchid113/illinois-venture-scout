import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('beginner-friendly public navigation preserves advanced and legacy routes',()=>{
 const ui=read('components/radar.tsx'),route=read('app/[section]/page.tsx');
 for(const label of ['Home','Explore Startups','Compare','My Research','Learn'])
  assert.ok(ui.includes("'"+label+"'"),'Navigation missing '+label);
 assert.match(route,/['"]learn['"]/);
 for(const legacy of ['activity','watchlists','research','sources','methodology'])
  assert.ok(route.includes("'"+legacy+"'"),'Missing legacy route '+legacy);
 assert.match(read('app/login/page.tsx'),/redirect\('\/'\)/);
});

test('experience preference is browser-local and changes presentation only',()=>{
 const ui=read('components/radar.tsx');
 assert.match(ui,/useState\(true\)/);
 assert.match(ui,/ivr-experience-mode/);
 assert.match(ui,/setBeginnerMode/);
 assert.match(ui,/setCards/);
 assert.match(ui,/aria-pressed/);
 assert.doesNotMatch(ui,/supabase\.auth\.signIn|signInWithOtp/);
 assert.match(ui,/LOCAL_WORKSPACE_KEY/);
});

test('homepage search, sector links and source counts use live data',()=>{
 const ui=read('components/radar.tsx');
 assert.match(ui,/action="\/discover" method="GET"/);
 assert.match(ui,/new URLSearchParams\(window\.location\.search\)/);
 assert.match(ui,/encodeURIComponent\(sector\.name\)/);
 assert.match(ui,/summary\.sectors\.slice/);
 assert.match(ui,/summary\.companies/);
 assert.match(ui,/summary\.sources/);
 assert.match(ui,/Explore original company research and available evidence/);
 assert.doesNotMatch(ui,/Company description not yet verified/);
 assert.match(ui,/ecosystemClaim\(c\)/);
 assert.doesNotMatch(ui,/Math\.random\(\)/);
});

test('Learn page covers diligence, source provenance and common VC terms',()=>{
 const learn=read('components/venture-learning.tsx');
 for(const term of ['Venture capital','Pre-seed','Incubator','Accelerator','University spinout','Due diligence','Equity funding','Traction','Not verified'])
  assert.ok(learn.includes(term),'Missing explanation for '+term);
 assert.match(learn,/university-endorsed/);
 assert.match(learn,/\/methodology/);
 assert.match(learn,/\/sources/);
 assert.match(learn,/<details/);
});

test('responsive styling and protected back end remain intact',()=>{
 const css=read('app/globals.css');
 const api=read('app/api/data/route.ts');
 assert.match(css,/industry-grid/);
 assert.match(css,/experience-toggle/);
 assert.match(css,/max-width:600px/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(api,/view==='workspace'.*status:403/);
 assert.match(api,/Server-side personal workspace writes are disabled/);
});
