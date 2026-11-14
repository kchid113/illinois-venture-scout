import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('startup card and directory table navigate to company profiles; save stays independent',()=>{
 const ui=read('components/radar.tsx');
 const style=read('app/premium.css');
 assert.ok(ui.includes('className="card-surface-link"'));
 assert.ok(ui.includes('Explore ${c.name} company profile'));
 assert.ok(ui.includes('className="home-company-spotlight"'));
 assert.ok(ui.includes('watchButton(c)'));
 assert.ok(ui.includes('href={`/companies/${c.id}`}'));
 assert.doesNotMatch(ui,/toggleCompare|compare-tray|href="\/compare"/);
 assert.match(style,/\.card-surface-link:focus-visible/);
});

test('source links are direct and visible, without per-field evidence badges',()=>{
 const ui=read('components/radar.tsx');
 const profile=read('components/company-overview.tsx');
 assert.doesNotMatch(ui,/className="citation evidence-action"/);
 assert.doesNotMatch(ui,/<span>Evidence<\/span>/);
 assert.ok(ui.includes('Original company sources'));
 assert.ok(ui.includes('href={e.url} target="_blank" rel="noopener noreferrer"'));
 assert.ok(profile.includes('className="evidence-summary-link"'));
 assert.match(read('app/contrast.css'),/\.claim-row \.source-link/);
});

test('missing fields and empty financial panels are omitted rather than filled with placeholders',()=>{
 const ui=read('components/radar.tsx'),profile=read('components/company-overview.tsx');
 assert.ok(ui.includes("firstDisplayableClaim(c.claims,['description'])"));
 assert.ok(ui.includes("firstDisplayableClaim(c.claims,['sector'])"));
 assert.ok(profile.includes('if(!matching.length)return null'));
 assert.ok(profile.includes('hasBusiness&&<section'));
 assert.ok(profile.includes('hasCapital&&<section'));
 assert.ok(profile.includes('hasStory&&<section'));
 assert.doesNotMatch(ui,/Not yet verified/);
 assert.doesNotMatch(profile,/Not yet verified/);
});

test('the manual enrichment snapshot contains uniquely identified official source profiles',()=>{
 const record=JSON.parse(read('data/verified-researchpark-descriptions-2026-11-14.json'));
 assert.equal(record.records.length,26);
 assert.equal(new Set(record.records.map(x=>x.company_id)).size,26);
 assert.equal(new Set(record.records.map(x=>x.url)).size,26);
 for(const r of record.records){
  assert.match(r.url,/^https:\/\/researchpark\.illinois\.edu\/[a-z0-9-]+\/$/);
  assert.equal(r.url,'https://researchpark.illinois.edu/'+r.company_id+'/');
  assert.ok(r.description.length>35 && r.description.length<650);
  assert.ok(r.evidence_note.length>25 && r.evidence_note.length<650);
 }
});
