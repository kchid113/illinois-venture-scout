import {upsertLocalWorkspace} from './local-workspace.mjs';

/**
 * Personal watchlists are browser-only. Names and memberships live in the
 * versioned workspace backup; only the currently selected name is a UI
 * preference stored separately.
 */
export const DEFAULT_WATCHLIST='My watchlist';

const canonical=name=>name.trim().replace(/\s+/g,' ');
const folded=name=>canonical(name).toLocaleLowerCase('en');

export function watchlistNames(items){
 const known=new Set([folded(DEFAULT_WATCHLIST)]);
 const names=[DEFAULT_WATCHLIST];
 for(const item of items){
  if(item.kind!=='watchlist'||typeof item.key!=='string')continue;
  const name=canonical(item.key);
  if(!name||known.has(folded(name)))continue;
  names.push(item.key);
  known.add(folded(name));
 }
 return names;
}

export function activeWatchlist(items,preferred){
 const names=watchlistNames(items);
 if(typeof preferred!=='string')return DEFAULT_WATCHLIST;
 return names.find(name=>folded(name)===folded(preferred))||DEFAULT_WATCHLIST;
}

export function normalizeNewWatchlistName(raw){
 if(typeof raw!=='string')throw Error('Enter a watchlist name.');
 if(/[\u0000-\u001f\u007f-\u009f]/u.test(raw))throw Error('Watchlist names cannot contain control characters.');
 const name=canonical(raw);
 if(!name)throw Error('Enter a watchlist name.');
 if(name.length>80)throw Error('Watchlist names must be 80 characters or fewer.');
 return name;
}

export function createWatchlist(items,rawName){
 const name=normalizeNewWatchlistName(rawName);
 if(watchlistNames(items).some(existing=>folded(existing)===folded(name)))
  throw Error('A watchlist with this name already exists. Select it instead.');
 return {name,items:upsertLocalWorkspace(items,'watchlist',name,'[]')};
}

export function watchlistCompanyIds(items,selected){
 const name=activeWatchlist(items,selected);
 const item=items.find(entry=>entry.kind==='watchlist'&&entry.key===name);
 if(!item)return [];
 let parsed;
 try{parsed=JSON.parse(item.value);}catch{throw Error('The saved watchlist cannot be read. Export your research before changing it.');}
 if(!Array.isArray(parsed)||!parsed.every(id=>typeof id==='string'&&id.length>0))
  throw Error('The saved watchlist has invalid company IDs.');
 return [...new Set(parsed)];
}

export function toggleWatchlistCompany(items,selected,companyId){
 if(typeof companyId!=='string'||!companyId||companyId.length>150)
  throw Error('Invalid company ID.');
 const name=activeWatchlist(items,selected);
 const ids=watchlistCompanyIds(items,name);
 const present=ids.includes(companyId);
 const next=present?ids.filter(id=>id!==companyId):[...ids,companyId];
 return {name,added:!present,items:upsertLocalWorkspace(items,'watchlist',name,JSON.stringify(next))};
}
