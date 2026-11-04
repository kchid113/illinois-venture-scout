import {normalizeCompanyName,matchCompany} from './source-candidates.mjs';

/**
 * This is an observation index, not a company-creation or investment-approval
 * service. A repeated normalized name across catalogs is a review hint.
 * Source identities, ownership, university backing and funding never follow
 * from a normalized name alone.
 */
export function reconcileCatalogs({seed,observations,sourceChecks,observedAt}){
 if(!Array.isArray(seed)||!Array.isArray(observations)||!Array.isArray(sourceChecks))
  throw Error('Invalid catalog inputs');
 const sourceIds=new Set(sourceChecks.map(c=>c.connector));
 const index=new Map(),seedIds=new Set(seed.map(x=>x.slug));
 const seedProfiles=new Set(seed.map(x=>x.profile));
 const eligibleRecords=[],conflicts=[];
 const seedCompanies=seed.map(x=>({id:x.slug,name:x.name,profile:x.profile}));
 const signature=x=>normalizeCompanyName(x.name);
 for(const record of observations){
  const name=String(record.name||'').trim();
  const key=signature(record);
  if(key.length<3||!sourceIds.has(record.connector)||
    typeof record.sourceUrl!=='string'||!record.sourceUrl.startsWith('https://'))
   throw Error('Invalid live official observation');
  const old=index.get(key);
  const seen={connector:record.connector,sourceUrl:record.sourceUrl,
   profile:record.profile||null,ventureWebsite:record.ventureWebsite||null,
   sector:record.sector||null,cohort:record.cohort||null};
  if(!old)index.set(key,{name,normalizedName:key,existingSeedCompanyId:null,sourceObservations:[seen],
   sourceCount:1,manualIdentityReview:true});
  else{
   if(!old.sourceObservations.some(s=>s.connector===seen.connector&&s.sourceUrl===seen.sourceUrl&&
    s.profile===seen.profile&&s.cohort===seen.cohort))
    old.sourceObservations.push(seen);
   old.sourceCount=new Set(old.sourceObservations.map(s=>s.connector)).size;
  }
  if(record.connector.startsWith('research-park-')){
   const existingById=seed.find(s=>s.slug===record.slug);
   const existingByProfile=seed.find(s=>s.profile===record.profile);
   const matched=matchCompany(name,seedCompanies);
   if(existingById||existingByProfile||matched){
    if(!existingById||existingById.name!==name||existingById.profile!==record.profile||
       matched?.id!==existingById.slug||existingByProfile?.slug!==existingById.slug)
     conflicts.push({name,slug:record.slug,sourceUrl:record.sourceUrl,
      reason:'Research Park identity differs from the reviewed original seed'});
   }else if(seedIds.has(record.slug)||seedProfiles.has(record.profile)){
    conflicts.push({name,slug:record.slug,sourceUrl:record.sourceUrl,
     reason:'Conflicting Research Park slug or profile'});
   }else{
    eligibleRecords.push(record);
   }
  }
 }
 for(const entry of index.values()){
  const match=matchCompany(entry.name,seedCompanies);
  entry.existingSeedCompanyId=match?.id||null;
  entry.manualIdentityReview=entry.existingSeedCompanyId===null;
 }
 return {
  schemaVersion:1,observedAt,seedCompanyCount:seed.length,
  sourceChecks,sourceObservations:observations.length,
  uniqueNormalizedNames:index.size,
  additionalResearchParkNames:eligibleRecords.map(r=>({slug:r.slug,name:r.name,profile:r.profile,sourceUrl:r.sourceUrl})),
  sourceIdentityConflicts:conflicts,
  completeness:sourceChecks.every(s=>s.status==='collected'),
  companies:[...index.values()].sort((a,b)=>a.normalizedName.localeCompare(b.normalizedName))
 };
}
export function renderSQL(ops,{label='Prepared source observations'}={}){
 if(!Array.isArray(ops))throw Error('SQL operations must be an array');
 const literal=value=>{
  if(value===null||value===undefined)return 'NULL';
  if(typeof value==='number'&&Number.isFinite(value))return String(value);
  if(typeof value==='string')return "'"+value.replaceAll("'","''")+"'";
  throw Error('Unexpected SQL value type');
 };
 const queries=ops.map(op=>{
  if(!op||typeof op.sql!=='string'||!Array.isArray(op.values))throw Error('Invalid prepared statement');
  const pieces=op.sql.split('?');
  if(pieces.length-1!==op.values.length)throw Error('SQL placeholder count changed');
  return pieces.map((part,i)=>part+(i<op.values.length?literal(op.values[i]):'')).join('')+';';
 });
 return ['-- '+label,'-- Source-observed; review before applying to production.',
  '-- Generated statements use canonical sources and SQL quote escaping.',
  'BEGIN TRANSACTION;',...queries,'COMMIT;',''].join('\n');
}
