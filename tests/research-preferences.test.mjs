import test from 'node:test';
import assert from 'node:assert/strict';
import {savedSearchName,parseSavedSearch,parseSavedThesis} from '../core/research-preferences.mjs';

test('saved search labels distinguish different filter combinations',()=>{
 assert.equal(savedSearchName({}),'All companies');
 assert.equal(savedSearchName({sector:'Robotics'}),'Sector: Robotics');
 assert.equal(savedSearchName({q:'battery',sector:'Energy'}),'Search: battery · Sector: Energy');
 assert.notEqual(
  savedSearchName({q:'robot',sector:'Robotics'}),
  savedSearchName({q:'robot',sector:'Health'})
 );
 assert.equal(savedSearchName({affiliation:'Research Park tenant'}),'Connection: Research Park tenant');
});

test('returning to saved searches validates stored user input before setting filters',()=>{
 assert.deepEqual(parseSavedSearch(JSON.stringify({q:' AI ',sector:'Robotics',affiliation:''})),
  {q:'AI',sector:'Robotics',affiliation:''});
 for(const raw of ['not-json','[]','null','{"q":42}',JSON.stringify({sector:'x'.repeat(101)})]){
  assert.throws(()=>parseSavedSearch(raw),/cannot be read|Invalid saved/);
 }
});

test('restored investment thesis is bounded and malformed backups cannot crash the UI',()=>{
 const original={sector:'Robotics',stage:'Seed',keywords:'energy, grid',weights:{sector:55,stage:20,keywords:25,progress:0}};
 const loaded=parseSavedThesis(JSON.stringify(original));
 assert.deepEqual(loaded,original);
 assert.equal(parseSavedThesis(JSON.stringify({...original,weights:{sector:150,stage:-10,keywords:5,progress:0}})).weights.sector,100);
 assert.equal(parseSavedThesis(JSON.stringify({...original,weights:{sector:150,stage:-10,keywords:5,progress:0}})).weights.stage,0);
 for(const raw of ['not json','[]','{}','{"weights":"bad"}',JSON.stringify({...original,weights:{sector:'NaN'}})]){
  assert.throws(()=>parseSavedThesis(raw),/cannot be read|Invalid saved/);
 }
});
