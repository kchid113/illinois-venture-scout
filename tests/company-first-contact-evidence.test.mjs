import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const radar=read('components/radar.tsx');
const overview=read('components/company-overview.tsx');
const css=read('app/contrast.css');

function luminance(hex){
 const channels=hex.replace('#','').match(/.{2}/g).map(x=>parseInt(x,16)/255);
 const vals=channels.map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 return .2126*vals[0]+.7152*vals[1]+.0722*vals[2];
}
function contrast(a,b){
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}

test('founder button opens a dedicated contact view rather than an unreliable anchor',()=>{
 assert.match(radar,/\['Overview','Founder contact','Signals','Research','Sources'\]/);
 assert.match(radar,/const goToFounderContact=\(\)=>\{setTab\('Founder contact'\);setFounderNavTick\(n=>n\+1\);\}/);
 assert.match(radar,/className="button contact-jump" aria-pressed=\{tab==='Founder contact'\} onClick=\{goToFounderContact\}/);
 assert.match(radar,/\{tab==='Founder contact'&&<div className="founder-contact-view">/);
 assert.doesNotMatch(radar,/href="#founder-contact"/);
 assert.match(radar,/requestAnimationFrame\(\(\)=>/);
 assert.match(radar,/target\.scrollIntoView/);
 assert.match(radar,/target\.focus\(\{preventScroll:true\}\)/);
 assert.match(radar,/prefers-reduced-motion: reduce/);
});

test('founder and team actions still require source-backed published claims',()=>{
 assert.match(overview,/export function CompanyContact/);
 assert.match(overview,/id="founder-contact" tabIndex=\{-1\}/);
 assert.match(overview,/className="panel padded founder-contact-teaser"/);
 assert.match(overview,/onClick=\{onFounderContact\}/);
 assert.match(overview,/found\.officialProfile/);
 assert.match(read('core/founder-outreach.mjs'),/company\?\.profile/);
 assert.match(overview,/found\.direct\.map/);
 assert.match(overview,/onSave/);
 assert.match(read('core/founder-outreach.mjs'),/c\.status==='Published'/);
 assert.match(read('core/founder-outreach.mjs'),/e\.relationship==='supports'/);
});

test('home screen displays actionable startup cards before supporting sections',()=>{
 const start=radar.indexOf("{section==='overview'&&");
 const end=radar.indexOf("{section==='discover'&&");
 assert.ok(start>=0&&end>start);
 const home=radar.slice(start,end);
 const hero=home.indexOf('<section className="premium-hero"');
 const cards=home.indexOf('<section className="home-company-spotlight"');
 const sector=home.indexOf('<div className="premium-sector-grid">');
 const actions=home.indexOf('<div className="premium-action-grid">');
 assert.ok(hero>=0&&cards>hero&&actions>cards&&sector>cards);
 assert.match(home,/companyCards\(companies\.slice\(0,6\)\)/);
 assert.match(home,/Browse all \{loading\?'':summary\.companies\} companies/);
 assert.match(home,/aria-labelledby="home-company-heading"/);
 assert.doesNotMatch(home,/premium-index-panel/);
 assert.match(radar,/className="card-surface-link"/);
 assert.match(radar,/\{watchButton\(c\)\}/);
 assert.doesNotMatch(radar,/toggleCompare/);
});

test('claims retain direct links but do not show repetitive evidence flags',()=>{
 assert.match(radar,/Original company sources/);
 assert.match(radar,/href=\{e\.url\} target="_blank" rel="noopener noreferrer"/);
 assert.doesNotMatch(radar,/className="citation evidence-action"/);
 assert.doesNotMatch(radar,/className="drawer-claim"/);
 assert.doesNotMatch(radar,/href="\/compare"/);
 assert.match(css,/\.claim-row \.source-link/);
 assert.match(css,/#founder-contact:focus/);
 assert.match(css,/home-company-spotlight/);
});
