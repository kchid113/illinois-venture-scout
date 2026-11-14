import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ui=read('components/radar.tsx');
const css=read('app/premium.css');
const layout=read('app/layout.tsx');

function luminance(hex){
 const channels=hex.match(/.{2}/g).map(x=>parseInt(x,16)/255);
 const linear=channels.map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
}
function contrast(foreground,background){
 const a=luminance(foreground.replace('#','')),b=luminance(background.replace('#',''));
 return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}

test('the dark design system loads after the existing stylesheet',()=>{
 assert.ok(layout.indexOf("import './globals.css'")<layout.indexOf("import './premium.css'"));
 assert.match(css,/color-scheme:dark/);
 assert.match(css,/--iv-bg:#080d13/);
 assert.match(css,/--iv-border:#2b3540/);
 assert.match(css,/--iv-radius:5px/);
 assert.match(css,/\.premium-hero/);
 assert.match(css,/\.evidence-panel/);
 assert.match(css,/\.glossary-item/);
 assert.match(css,/\.company-card/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

test('dark palette passes WCAG AA for ordinary text and primary action text',()=>{
 for(const color of ['#ecf2f6','#b4c0cb','#94a3b2']){
  assert.ok(contrast(color,'#111820')>=4.5, color+' lacks readable contrast');
 }
 assert.ok(contrast('#14161b','#ef8955')>=4.5);
});

test('redesigned homepage uses a functional public search and real database counts',()=>{
 assert.match(ui,/className="premium-hero"/);
 assert.match(ui,/action="\/discover" method="GET"/);
 assert.match(ui,/summary\.companies/);
 assert.match(ui,/summary\.sources/);
 assert.match(ui,/summary\.claims/);
 assert.match(ui,/summary\.sectors\.slice/);
 assert.match(ui,/encodeURIComponent\(sector\.name\)/);
 assert.match(ui,/companies\.slice\(0,6\)/);
 assert.doesNotMatch(ui,/<IllinoisHeroArt\s*\/>/);
 assert.match(ui,/Evidence, not speculation/);
});

test('research tools, no-login browsing, and mobile controls remain available',()=>{
 for(const label of ['Home','Explore Startups','My Research','Learn'])
  assert.ok(ui.includes("'"+label+"'"));
 assert.match(ui,/aria-expanded=\{menu\}/);
 assert.match(ui,/onClick=\{\(\)=>setMenu\(false\)\}/);
 assert.match(ui,/ivr-experience-mode/);
 assert.match(ui,/LOCAL_WORKSPACE_KEY/);
 assert.match(read('app/login/page.tsx'),/redirect\('\/'\)/);
 const api=read('app/api/data/route.ts');
 assert.match(api,/view==='workspace'.*status:403/);
 assert.match(read('app/api/cron/refresh/[connector]/route.ts'),/CRON_SECRET/);
});
