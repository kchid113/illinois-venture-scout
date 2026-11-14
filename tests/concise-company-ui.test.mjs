import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hasDisplayValue,displayableClaims,firstDisplayableClaim} from '../core/display-facts.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('hide only genuinely missing claim values, preserve real negative findings and zero',()=>{
 for(const x of ['', '  ', '—', '-', 'n/a', 'N/A.', 'null', 'unknown', 'Not recorded.', 'not yet verified', 'tbd','Pending']){
  assert.equal(hasDisplayValue(x),false,JSON.stringify(x));
 }
 for(const x of ['0','No funding reported','No customers to date','B2B SaaS','AI platform','0.00','$0','No physical office']){
  assert.equal(hasDisplayValue(x),true,x);
 }
 assert.equal(hasDisplayValue(undefined),false);
});

test('do not render blank company facts, even if there are official evidence records',()=>{
 const claims=[
 {field:'description',value:'Not available',evidence:[{relationship:'supports'}]},
 {field:'description',value:'Creates machine-vision sensors',evidence:[{relationship:'supports'}]},
 {field:'stage',value:'—',evidence:[]},
 {field:'sector',value:'Robotics',evidence:[{relationship:'supports'}]},
 {field:'sector',value:'N/A',evidence:[{relationship:'supports'}]},
 {field:'funding round',value:'0',evidence:[{relationship:'supports'}]},
 ];
 assert.equal(firstDisplayableClaim(claims,['description']).value,'Creates machine-vision sensors');
 assert.equal(firstDisplayableClaim(claims,['stage']),null);
 assert.equal(displayableClaims(claims,['sector']).length,1);
 assert.equal(firstDisplayableClaim(claims,['funding round']).value,'0');
});

test('comparison controls and route are retired, without deleting source-backed records',()=>{
 const ui=read('components/radar.tsx'),route=read('app/[section]/page.tsx');
 assert.ok(!route.includes("'compare'"));
 for(const x of ["href=\"/compare\"","toggleCompare(","compare-tray","Compare companies"]){
  assert.ok(!ui.includes(x),'Comparison UI still contains '+x);
 }
 assert.ok(ui.includes("href={e.url} target=\"_blank\" rel=\"noopener noreferrer\""));
 assert.ok(ui.includes("firstDisplayableClaim(c.claims,['description'])"));
 assert.ok(read('app/api/data/route.ts').includes("view==='workspace'"));
 assert.ok(read('components/company-overview.tsx').includes('evidence-summary-link'));
});
