/** Browser-only personal research. Never sync these records to shared Supabase tables. */
export const LOCAL_WORKSPACE_KEY='ivr-public-workspace-v1';
export const LOCAL_WORKSPACE_VERSION=1;
const allowedKinds=new Set(['watchlist','note','status','search','thesis','report','contact']);
const maxItems=500;
const maxValueLength=40000;

export function validateLocalWorkspace(items){
 if(!Array.isArray(items)||items.length>maxItems)throw Error('Invalid research backup: too many records');
 const checked=new Map();
 for(const entry of items){
  if(!entry||typeof entry!=='object'||!allowedKinds.has(entry.kind)||
    typeof entry.key!=='string'||entry.key.length<1||entry.key.length>150||
    typeof entry.value!=='string'||entry.value.length>maxValueLength)
   throw Error('Invalid research backup record');
  if(entry.kind==='watchlist'){
   let ids;
   try{ids=JSON.parse(entry.value);}catch{throw Error('Invalid saved watchlist');}
   if(!Array.isArray(ids)||ids.length>500||!ids.every(id=>typeof id==='string'&&id.length>0&&id.length<=150))
    throw Error('Invalid saved watchlist');
  }
  if(['search','thesis','contact'].includes(entry.kind)){
   let data;
   try{data=JSON.parse(entry.value);}catch{throw Error('Invalid saved research data');}
   if(!data||typeof data!=='object'||Array.isArray(data))
    throw Error('Invalid saved research data');
  }
  checked.set(entry.kind+'\u0000'+entry.key,{kind:entry.kind,key:entry.key,value:entry.value});
 }
 return [...checked.values()];
}
export function decodeLocalWorkspace(raw){
 if(raw===null||raw==='')return [];
 let parsed;
 try{parsed=JSON.parse(raw);}catch{throw Error('Saved research data is unreadable');}
 if(!parsed||parsed.version!==LOCAL_WORKSPACE_VERSION||!Array.isArray(parsed.items))
  throw Error('Unsupported saved research format');
 return validateLocalWorkspace(parsed.items);
}
export function encodeLocalWorkspace(items){
 return JSON.stringify({version:LOCAL_WORKSPACE_VERSION,items:validateLocalWorkspace(items)});
}
export function upsertLocalWorkspace(items,kind,key,value){
 return validateLocalWorkspace([...items.filter(entry=>entry.kind!==kind||entry.key!==key),{kind,key,value}]);
}
