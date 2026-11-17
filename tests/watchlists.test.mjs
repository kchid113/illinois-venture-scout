import test from 'node:test';
import assert from 'node:assert/strict';
import {LOCAL_WORKSPACE_KEY,encodeLocalWorkspace,decodeLocalWorkspace,upsertLocalWorkspace} from '../core/local-workspace.mjs';
import {DEFAULT_WATCHLIST,watchlistNames,activeWatchlist,normalizeNewWatchlistName,createWatchlist,watchlistCompanyIds,toggleWatchlistCompany} from '../core/watchlists.mjs';

test('default watchlist exists without creating a storage record',()=>{
 assert.equal(DEFAULT_WATCHLIST,'My watchlist');
 assert.deepEqual(watchlistNames([]),['My watchlist']);
 assert.equal(activeWatchlist([],'missing'),'My watchlist');
 assert.deepEqual(watchlistCompanyIds([],DEFAULT_WATCHLIST),[]);
 assert.equal(LOCAL_WORKSPACE_KEY,'ivr-public-workspace-v1');
});

test('creator trims names, persists empty lists and never erases duplicates',()=>{
 let current=[];
 const original=createWatchlist(current,'  Climate   Technology  ');
 current=original.items;
 assert.equal(original.name,'Climate Technology');
 assert.deepEqual(watchlistNames(current),['My watchlist','Climate Technology']);
 assert.deepEqual(watchlistCompanyIds(current,'Climate Technology'),[]);
 current=toggleWatchlistCompany(current,'Climate Technology','cache-energy').items;
 assert.deepEqual(watchlistCompanyIds(current,'Climate Technology'),['cache-energy']);
 for(const duplicate of ['climate technology',' CLIMATE  TECHNOLOGY ','My watchlist','mY WaTcHlIsT']){
  assert.throws(()=>createWatchlist(current,duplicate),/already exists/);
  assert.deepEqual(watchlistCompanyIds(current,'Climate Technology'),['cache-energy']);
 }
 assert.deepEqual(watchlistCompanyIds(decodeLocalWorkspace(encodeLocalWorkspace(current)),'Climate Technology'),['cache-energy']);
});

test('invalid, whitespace-only, control and overlength watchlist names have actionable errors',()=>{
 for(const value of [null,undefined,0,'','  ','\n','\u0000bad','bad\tname']){
  assert.throws(()=>normalizeNewWatchlistName(value),/Enter a watchlist name|control characters/);
 }
 assert.throws(()=>createWatchlist([],'x'.repeat(81)),/80 characters/);
 assert.equal(normalizeNewWatchlistName('  Ag   Tech  '),'Ag Tech');
 assert.equal(normalizeNewWatchlistName('Launch/2026'),'Launch/2026');
});

test('different lists retain independent memberships through selection and reload',()=>{
 let items=createWatchlist([],'Fund A').items;
 items=createWatchlist(items,'Fund B').items;
 items=toggleWatchlistCompany(items,'Fund A','company-1').items;
 items=toggleWatchlistCompany(items,'Fund A','company-2').items;
 items=toggleWatchlistCompany(items,'Fund B','company-3').items;
 assert.deepEqual(watchlistCompanyIds(items,'Fund A'),['company-1','company-2']);
 assert.deepEqual(watchlistCompanyIds(items,'Fund B'),['company-3']);
 assert.equal(activeWatchlist(items,'fund a'),'Fund A');
 assert.equal(activeWatchlist(items,'fund b'),'Fund B');
 assert.equal(activeWatchlist(items,'deleted list'),'My watchlist');
 assert.deepEqual(watchlistCompanyIds(items,'My watchlist'),[]);
 const restored=decodeLocalWorkspace(encodeLocalWorkspace(items));
 assert.deepEqual(watchlistCompanyIds(restored,'Fund A'),['company-1','company-2']);
 assert.deepEqual(watchlistCompanyIds(restored,'Fund B'),['company-3']);
});

test('rapid toggles use the last committed state, never a stale render snapshot',()=>{
 const items=createWatchlist([],'Pipeline').items;
 const first=toggleWatchlistCompany(items,'Pipeline','venture-1');
 assert.equal(first.added,true);
 const second=toggleWatchlistCompany(first.items,'Pipeline','venture-1');
 assert.equal(second.added,false);
 assert.deepEqual(watchlistCompanyIds(second.items,'Pipeline'),[]);
 const third=toggleWatchlistCompany(second.items,'Pipeline','venture-1');
 assert.equal(third.added,true);
 assert.deepEqual(watchlistCompanyIds(third.items,'Pipeline'),['venture-1']);
 assert.throws(()=>toggleWatchlistCompany(third.items,'Pipeline',''),/Invalid company ID/);
});

test('legacy duplicate company IDs are normalized when the next membership change is saved',()=>{
 let items=upsertLocalWorkspace([],'watchlist','My watchlist','["a","a","b"]');
 assert.deepEqual(watchlistCompanyIds(items,DEFAULT_WATCHLIST),['a','b']);
 items=toggleWatchlistCompany(items,DEFAULT_WATCHLIST,'c').items;
 assert.deepEqual(watchlistCompanyIds(items,DEFAULT_WATCHLIST),['a','b','c']);
});

test('no accidental loss on corrupted records or workspace capacity',()=>{
 const bad=[{kind:'watchlist',key:'Broken',value:'{malformed'}];
 assert.throws(()=>watchlistCompanyIds(bad,'Broken'),/cannot be read/);
 assert.throws(()=>toggleWatchlistCompany(bad,'Broken','company-1'),/cannot be read/);
 const full=Array.from({length:500},(_,i)=>({kind:'note',key:'n'+i,value:'ok'}));
 assert.throws(()=>createWatchlist(full,'Extra'),/too many records/);
});
