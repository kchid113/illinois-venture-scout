import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ui=read('components/radar.tsx');
const css=read('app/directory.css');
const layout=read('app/layout.tsx');

function luminance(hex){
 const vals=hex.replace('#','').match(/../g).map(v=>parseInt(v,16)/255)
  .map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
 return vals[0]*0.2126+vals[1]*0.7152+vals[2]*0.0722;
}
function contrast(a,b){
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
}

test('search-first directory stylesheet is loaded last and uses UIUC dark palette',()=>{
 assert.ok(layout.indexOf("import './contrast.css'")<layout.indexOf("import './directory.css'"));
 for(const hex of ['#060D16','#102C49','#FF7A21','#F5FAFF']){
  assert.ok(css.includes(hex),hex);
 }
 assert.match(css,/\.cb-company-table/);
 assert.match(css,/\.cb-filter-rail/);
 assert.match(css,/\.cb-global-search/);
 assert.match(css,/\.cb-profile-facts/);
 assert.match(css,/@media\(max-width:850px\)/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

test('directory foreground and action colors meet AA contrast',()=>{
 for(const [fg,bg,label] of [
  ['#F5FAFF','#060D16','white on ink'],
  ['#D4E6F4','#102C49','body on navy'],
  ['#FF7A21','#071423','orange accent on dark'],
  ['#0A1723','#FF7A21','primary CTA dark lettering'],
  ['#A5C7E1','#0A2239','table header'],
  ['#AECDE2','#0E2945','company descriptions'],
  ['#FFB681','#102F4D','original listing link'],
 ]){
  assert.ok(contrast(fg,bg)>=4.5,label+' contrast below AA: '+contrast(fg,bg).toFixed(2));
 }
});

test('header and homepage allow real company searches without an AI or fabricated data',()=>{
 assert.match(ui,/className="cb-global-search" action="\/discover" method="GET"/);
 assert.match(ui,/name="q" maxLength=\{120\}/);
 assert.match(ui,/className="home-search premium-search" action="\/discover" method="GET"/);
 assert.match(ui,/companyDirectoryTable\(companies\.slice\(0,8\)\)/);
 assert.match(ui,/summary\.companies/);
 assert.match(ui,/summary\.sources/);
 assert.doesNotMatch(ui,/Crunchbase Scout|AI recommendation engine|predicted funding/);
});

test('filters and active chips remain operational and constrained to available data',()=>{
 assert.match(ui,/const filters=<aside className="cb-filter-rail"/);
 assert.match(ui,/id="cb-filter-sector"/);
 assert.match(ui,/id="cb-filter-affiliation"/);
 assert.match(ui,/id="cb-filter-search"/);
 assert.match(ui,/summary\.sectors\.flatMap/);
 assert.match(ui,/setAffiliation\(affiliation==='EnterpriseWorks Incubator'/);
 assert.match(ui,/setAffiliation\(affiliation==='iVenture Accelerator'/);
 assert.match(ui,/setAffiliation\(affiliation==='Research Park tenant'/);
 assert.match(ui,/cb-active-filters/);
 assert.match(ui,/setPage\(1\)/);
 assert.match(ui,/aria-label="Sort companies"/);
});

test('each logo-led table row opens a company and preserves independent watchlist action',()=>{
 assert.match(ui,/className="cb-company-row"/);
 assert.match(ui,/className="cb-row-hit"/);
 assert.match(ui,/aria-label=\{\`Open \$\{c\.name\} company profile\`\}/);
 assert.match(ui,/className="cb-row-save-cell">\{watchButton\(c\)\}/);
 assert.match(ui,/CompanyLogo company=\{c\} variant="table"/);
 assert.match(ui,/const companyTable=\(rows:Company\[\]\)=>cards\?companyCards\(rows\):companyDirectoryTable\(rows\)/);
 assert.match(ui,/\[cards,setCards\]=useState\(false\)/);
 assert.match(css,/\.cb-row-hit:focus-visible/);
 assert.match(css,/\.cb-row-save-cell button\s*\{/);
});

test('company profiles show only actual source-backed fields and original links',()=>{
 assert.match(ui,/className="cb-profile-facts"/);
 assert.match(ui,/firstDisplayableClaim\(selectedCompany\.claims,\['stage'\]\)/);
 assert.match(ui,/ecosystemClaim\(selectedCompany\)/);
 assert.match(ui,/selectedCompany\.profile&&<a href=\{selectedCompany\.profile\}/);
 assert.match(ui,/target="_blank" rel="noopener noreferrer"/);
 assert.match(ui,/goToFounderContact/);
 assert.match(ui,/href=\{e\.url\} target="_blank" rel="noopener noreferrer"/);
 assert.doesNotMatch(ui,/toggleCompare\(|className="citation evidence-action"/);
 assert.match(read('app/api/data/route.ts'),/view==='workspace'.*status:403/);
});
