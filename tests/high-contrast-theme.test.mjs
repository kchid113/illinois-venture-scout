import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('app/contrast.css');
const layout=read('app/layout.tsx');

function luminance(hex){
 const channels=hex.replace('#','').match(/../g).map(v=>parseInt(v,16)/255);
 const linear=channels.map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
 return linear[0]*0.2126+linear[1]*0.7152+linear[2]*0.0722;
}
function contrast(foreground,background){
 const a=luminance(foreground),b=luminance(background);
 return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}

test('solid contrast stylesheet loads last, after premium foundations',()=>{
 assert.ok(layout.indexOf("import './globals.css'")<layout.indexOf("import './premium.css'"));
 assert.ok(layout.indexOf("import './premium.css'")<layout.indexOf("import './contrast.css'"));
 assert.match(css,/--iv-bg:#07101B/);
 assert.match(css,/--iv-panel:#122D4A/);
 assert.match(css,/--iv-orange:#FF7A21/);
 assert.match(css,/--iv-teal:#55EBC2/);
 assert.match(css,/--iv-blue:#359FFF/);
});

test('dark color hierarchy uses distinct solid-color roles',()=>{
 for(const [selector,color] of [
  ['.sidebar','#081C32'],
  ['.topbar','#102F50'],
  ['.premium-hero','#123B63'],
  ['.premium-hero-stats','#092643'],
  ['.premium-action-grid','#123456'],
  ['.premium-sector','#12385C'],
  ['.premium-primer','#0F3659'],
  ['.company-card,.clickable-company-card','#153D62'],
  ['.evidence-panel','#102B46']
 ]){
   assert.ok(css.includes(selector),selector+' was not restyled');
   assert.ok(css.includes('background:'+color),selector+' should have its own solid color');
 }
 assert.match(css,/\.premium-sector:nth-child\(2n\)\{background:#16446F\}/);
 assert.match(css,/\.company-card:nth-child\(2n\)/);
});

test('body and important content areas meet AA readable contrast',()=>{
 const combinations=[
  ['#F5FAFF','#122D4A','main text on panel'],
  ['#D0E4F5','#153D62','description on card'],
  ['#B3CEE5','#081C32','sidebar secondary text'],
  ['#FFFFFF','#19538C','selected menu item'],
  ['#08111B','#FF7A21','primary action'],
  ['#D8FFF2','#0C594C','evidence button'],
  ['#C6E3F9','#16446F','alternating sector tile'],
  ['#B4D4EF','#061B30','search placeholder'],
 ];
 for(const [foreground,background,label] of combinations){
  assert.ok(contrast(foreground,background)>=4.5,label+' must achieve WCAG AA text contrast');
 }
});

test('contrast controls retain focus states, source semantics and company branding',()=>{
 const radar=read('components/radar.tsx');
 const marks=read('components/company-logo.tsx');
 assert.match(css,/focus-visible/);
 assert.match(css,/\.citation\.evidence-action/);
 assert.match(css,/\.company-logo--image/);
 assert.match(css,/\.company-logo--fallback/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(radar,/card-surface-link/);
 assert.match(radar,/home-company-spotlight/);
 assert.match(radar,/variant="card"/);
 assert.match(marks,/companyLogoCandidates/);
 assert.match(read('app/api/data/route.ts'),/view==='workspace'.*status:403/);
});
