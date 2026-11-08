import test from 'node:test';
import assert from 'node:assert/strict';
import {LOCAL_WORKSPACE_KEY,decodeLocalWorkspace,encodeLocalWorkspace,upsertLocalWorkspace,validateLocalWorkspace} from '../core/local-workspace.mjs';

test('new visitor starts with empty browser research and the key is namespaced',()=>{
 assert.equal(LOCAL_WORKSPACE_KEY,'ivr-public-workspace-v1');
 assert.deepEqual(decodeLocalWorkspace(null),[]);
 assert.deepEqual(decodeLocalWorkspace(''),[]);
});
test('watchlists and notes are versioned, persist, and overwrite by key',()=>{
 let items=upsertLocalWorkspace([],'watchlist','My watchlist','["company-a"]');
 items=upsertLocalWorkspace(items,'note','company-a','My note');
 items=upsertLocalWorkspace(items,'note','company-a','My revised note');
 assert.equal(items.length,2);
 assert.deepEqual(decodeLocalWorkspace(encodeLocalWorkspace(items)),items);
 assert.equal(items.find(x=>x.kind==='note').value,'My revised note');
});
test('invalid and malicious backups are rejected, not silently imported',()=>{
 for(const raw of ['{bad','[]','{"version":2,"items":[]}','{"version":1,"items":{}}'])
  assert.throws(()=>decodeLocalWorkspace(raw));
 assert.throws(()=>validateLocalWorkspace([{kind:'admin',key:'x',value:'secret'}]));
 assert.throws(()=>validateLocalWorkspace([{kind:'note',key:'x',value:5}]));
 assert.throws(()=>validateLocalWorkspace([{kind:'watchlist',key:'x',value:'not json'}]));
 assert.throws(()=>validateLocalWorkspace([{kind:'watchlist',key:'x',value:'[99]'}]));
 assert.throws(()=>validateLocalWorkspace([{kind:'thesis',key:'x',value:'[]'}]));
 assert.throws(()=>validateLocalWorkspace(Array.from({length:501},(_,i)=>({kind:'note',key:String(i),value:'x'}))));
 assert.throws(()=>upsertLocalWorkspace([],'note','x','a'.repeat(40001)));
});
