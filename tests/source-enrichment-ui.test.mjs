import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('the entire startup card navigates to its research profile, preserving independent actions',()=>{
 const ui=read('components/radar.tsx');
 const style=read('app/premium.css');
 assert.match(ui,/className="card-surface-link" href=\{\`\/companies\/\$\{c\.id\}\`\}/);
 assert.match(ui,/aria-label=\{\`Explore \$\{c\.name\} company profile\`\}/);
 assert.match(ui,/className="index-row-link"/);
 assert.match(ui,/aria-pressed=\{compare\.some\(/);
 assert.match(style,/\.card-surface-link,\.index-row-link/);
 assert.match(style,/\.clickable-company-card \.card-controls \.icon-button/);
 assert.match(style,/\.card-surface-link:focus-visible/);
});

test('source evidence actions are descriptive and prominent, not tiny link icons',()=>{
 const ui=read('components/radar.tsx');
 const profile=read('components/company-overview.tsx');
 assert.match(ui,/className="citation evidence-action"/);
 assert.match(ui,/<span>Evidence<\/span>/);
 assert.match(ui,/Inspect \{e\.publisher\} evidence/);
 assert.match(profile,/className="evidence-summary-link"/);
 assert.match(profile,/className="research-source-cta"/);
 assert.match(read('app/premium.css'),/\.evidence-action\.citation/);
});

test('research pages remain accurate without repetitive missing-data placeholders',()=>{
 const ui=read('components/radar.tsx');
 const profile=read('components/company-overview.tsx');
 assert.doesNotMatch(ui,/Not yet verified/);
 assert.doesNotMatch(profile,/Not yet verified/);
 assert.match(profile,/if\(!matching\.length\)return null/);
 assert.match(profile,/To investigate/);
 assert.match(profile,/company\.profile/);
 assert.match(ui,/c\.claims\.length/);
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
