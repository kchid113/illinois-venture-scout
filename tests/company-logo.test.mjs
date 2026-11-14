import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {companyLogoCandidates,RESEARCH_PARK_MARKS,trustedCompanyHost} from '../core/company-logo-sources.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('curated Research Park logos are specific university-profile assets',()=>{
 assert.ok(Object.keys(RESEARCH_PARK_MARKS).length>=24);
 for(const [slug,url] of Object.entries(RESEARCH_PARK_MARKS)){
  assert.match(slug,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.match(url,/^https:\/\/researchpark\.illinois\.edu\/wp-content\/uploads\/\d{4}\/\d{2}\/[^/?#]+\.(?:jpg|jpeg|png)$/i);
  assert.doesNotMatch(url,/rp-thumbnail|illinois-wordmark/i);
 }
});

test('university profile marks are preferred to verified company site icon',()=>{
 const c={id:'aganswers-ai',name:'AgAnswers.ai',profile:'https://researchpark.illinois.edu/aganswers-ai/',
  claims:[{field:'website',value:'https://www.aganswers.ai/',evidence:[{relationship:'supports'}]}]};
 const urls=companyLogoCandidates(c);
 assert.equal(urls[0],RESEARCH_PARK_MARKS['aganswers-ai']);
 assert.equal(urls[1],'https://www.aganswers.ai/apple-touch-icon.png');
 assert.equal(urls[2],'https://www.aganswers.ai/favicon.ico');
});

test('unlisted university profiles never show the university favicon as a company logo',()=>{
 const c={id:'second-chance-innovations',name:'Second Chance Innovations',profile:'https://researchpark.illinois.edu/second-chance-innovations/',claims:[]};
 assert.deepEqual(companyLogoCandidates(c),[]);
 const social={id:'venture',name:'Venture',profile:'https://www.linkedin.com/company/venture/'};
 assert.deepEqual(companyLogoCandidates(social),[]);
});

test('new OTM and iVenture records use only their official associated venture domain',()=>{
 const otm={id:'otm-aptimmune',name:'Aptimmune',profile:'https://aptimmune.com/'};
 assert.deepEqual(companyLogoCandidates(otm),['https://aptimmune.com/apple-touch-icon.png','https://aptimmune.com/favicon.ico']);
 const cohort={id:'iventure-amber',name:'Amber Agriculture',profile:'https://www.amber.ag/'};
 assert.deepEqual(companyLogoCandidates(cohort),['https://www.amber.ag/apple-touch-icon.png','https://www.amber.ag/favicon.ico']);
});

test('unsafe or ambiguous icon hosts are rejected',()=>{
 for(const input of ['http://example.com','https://localhost','https://127.0.0.1','https://me:pass@example.com','https://researchpark.illinois.edu/company','https://otm.illinois.edu/foo','https://gwb.com/','data:text/html,a']){
  assert.equal(trustedCompanyHost(input),null,input);
 }
 assert.equal(trustedCompanyHost('https://example.com/company'),'example.com');
 assert.deepEqual(companyLogoCandidates({id:'t',name:'Test',profile:'https://researchpark.illinois.edu/no-match/',claims:[
  {field:'website',value:'http://localhost',evidence:[{relationship:'supports'}]},
  {field:'website',value:'https://example.com',evidence:[{relationship:'contradicts'}]}
 ]}),[]);
});

test('logo component appears in card, table and profile interfaces',()=>{
 const ui=read('components/radar.tsx'),component=read('components/company-logo.tsx');
 for(const variant of ['card','table','profile'])assert.match(ui,new RegExp('variant="'+variant+'"'));
 assert.match(ui,/card-surface-link/);
 assert.match(ui,/home-company-spotlight/);
 assert.match(component,/onError=\{\(\)=>setAttempt\(i=>i\+1\)\}/);
 assert.match(component,/company-logo__initials/);
 assert.match(component,/unoptimized/);
});

test('gloss remains dark, keyboard accessible, and reduced-motion safe',()=>{
 const css=read('app/premium.css');
 assert.match(css,/\.company-logo--fallback/);
 assert.match(css,/\.company-logo--profile/);
 assert.match(css,/linear-gradient/);
 assert.match(css,/\.clickable-company-card:hover/);
 assert.match(css,/focus-within/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
