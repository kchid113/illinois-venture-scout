/** One-time, explicit investor-private research migration.
 * Requires operator-reviewed exact owner mappings; never guesses users by email.
 * Usage: node scripts/import-private-workspace.mjs export.json owner-map.json
 */
import {readFile} from 'node:fs/promises';
import {database,all,closeDatabase} from '../db/postgres.mjs';
import {validatePrivateContact} from '../core/founder-outreach.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const permitted=new Set(['watchlist','note','status','search','thesis','report','contact']);
const [,,sourcePath,mapPath]=process.argv;
if(!sourcePath||!mapPath)throw Error('Usage: import-private-workspace.mjs export.json verified-user-map.json');
const source=JSON.parse(await readFile(sourcePath,'utf8'));
const mapping=JSON.parse(await readFile(mapPath,'utf8'));
if(!Array.isArray(source.records)||!source.records.length||
 !mapping||typeof mapping!=='object'||Array.isArray(mapping))
 throw Error('Invalid private workspace migration inputs');
const ids=Object.values(mapping);
if(ids.length!==new Set(ids).size||ids.some(id=>!uuid.test(String(id))))
 throw Error('Every legacy user must map to one different, valid Supabase user UUID');
try{
 for(const id of ids){
  const found=await all('SELECT id FROM auth.users WHERE id=?',id);
  if(found.length!==1)throw Error('Mapping includes a Supabase Auth user that does not exist');
 }
 const db=database(),ops=[],keys=new Set();
 for(const item of source.records){
  if(!item||typeof item!=='object'||!Object.hasOwn(mapping,String(item.user_id)))
   throw Error('Unmapped private investor account in export; import aborted');
  const owner=String(mapping[String(item.user_id)]);
  const {kind,key,value,updated_at}=item;
  if(!permitted.has(kind)||typeof key!=='string'||!key.trim()||key.length>150||
   typeof value!=='string'||value.length>40000||!Number.isFinite(Date.parse(updated_at)))
   throw Error('Invalid private workspace record; import aborted');
  const idKey=owner+'|'+kind+'|'+key;
  if(keys.has(idKey))throw Error('Duplicate private workspace key in input; reconcile before importing');
  keys.add(idKey);
  if(kind==='contact')validatePrivateContact(JSON.parse(value));
  ops.push(db.prepare(`INSERT INTO workspace(id,user_id,kind,key,value,updated_at)
   VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,kind,key)
   DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
   .bind(crypto.randomUUID(),owner,kind,key,value,updated_at));
 }
 await db.batch(ops);
 console.log('Verified private workspace records imported:',ops.length,
  '; distinct authenticated accounts:',ids.length);
}finally{await closeDatabase();}
