/**
 * Reproducible *live* catalog capture. Runs on GitHub-hosted Node 22 so the
 * official HTTPS source pages can be retrieved without local DNS access.
 * No account secrets, production database, API tokens or private notes used.
 *
 * All source failures are explicit in the committed manifest, not silently
 * replaced by guessed names or the original 29-company seed.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {collectDirectory} from '../core/ingestion.mjs';
import {officialHTML,OFFICIAL_LISTINGS,parseEnterpriseWorksCandidates,
 parseIVentureCandidates,parseOTMCandidates} from '../core/source-adapters.mjs';
import {normalizeCompanyName,matchCompany,candidateStatements} from '../core/source-candidates.mjs';
import {recordStatements} from '../core/records.mjs';
import {reconcileCatalogs,renderSQL} from '../core/catalog-snapshot.mjs';

const observedAt=new Date().toISOString();
const seed=JSON.parse(await readFile(new URL('../data/import.json',import.meta.url),'utf8'));
const known=new Map(seed.map(c=>[c.slug,{id:c.slug,name:c.name,profile:c.profile}]));
const records=[],candidates=[],observations=[],sourceChecks=[];
const base='https://researchpark.illinois.edu/category/tenant-directory/startup/';
const errors=[];
const checked=(connector,url,fn)=>async()=>{
 try{
  const rows=await fn();
  if(!Array.isArray(rows)||rows.length===0)throw Error('Source extraction yielded no qualifying entries');
  sourceChecks.push({connector,url,status:'collected',count:rows.length});
  console.log('COLLECTED '+connector+' '+rows.length+' entries from '+url);
  return rows;
 }catch(e){
  const message=String(e instanceof Error?e.message:e).slice(0,200);
  sourceChecks.push({connector,url,status:'failed',count:0,error:message});
  errors.push(connector+': '+message);
  console.log('SOURCE_UNAVAILABLE '+connector+' '+message);
  return [];
 }
};
function companySet(){return [...known.values()];}
function observeCandidate(candidate){
 const data=candidate.payload||{},name=String(candidate.companyName).trim();
 observations.push({name,connector:candidate.connector,sourceUrl:candidate.sourceUrl,
  profile:data.profileUrl||null,ventureWebsite:data.ventureWebsite||null,
  sector:data.sector||null,cohort:data.cohort||null});
 // Store only exact identity links. New companies require explicit review.
 const matched=matchCompany(name,companySet());
 candidate.companyId=matched?.id||null;
 candidates.push(candidate);
}
// Collect individual directory pages independently: one bad page must not
// erase already retrieved official source observations.
for(let page=1;page<=5;page++){
 const url=page===1?base:base+'page/'+page+'/';
 const connector='research-park-'+page;
 const collected=await checked(connector,url,()=>collectDirectory({pages:1,startPage:page}))();
 for(const r of collected){
  records.push(r);
  observations.push({name:r.name,slug:r.slug,connector,sourceUrl:r.sourceUrl,
   profile:r.profile,sector:r.sector});
  if(!known.has(r.slug))known.set(r.slug,{id:r.slug,name:r.name,profile:r.profile});
 }
}
for(let page=1;page<=6;page++){
 const connector='enterpriseworks-directory';
 const url=page===1?OFFICIAL_LISTINGS[connector].url:
  OFFICIAL_LISTINGS[connector].url+'page/'+page+'/';
 const key=connector;
 const collected=await checked(key,url,async()=>{
  const listing=await officialHTML(connector,fetch,{page});
  return parseEnterpriseWorksCandidates(listing.html,companySet(),observedAt,listing.url);
 })();
 for(const c of collected)observeCandidate(c);
}
for(const connector of ['iventure-cohorts','otm-startups']){
 const url=OFFICIAL_LISTINGS[connector].url;
 const collected=await checked(connector,url,async()=>{
  const listing=await officialHTML(connector);
  return connector==='iventure-cohorts'
   ?parseIVentureCandidates(listing.html,companySet(),observedAt)
   :parseOTMCandidates(listing.html,companySet(),observedAt);
 })();
 for(const c of collected)observeCandidate(c);
}
// The OTM endpoint is explicitly blocked by its robots policy for the
// automated job. A separate manually reviewed, date-stamped public listing
// is acceptable as a PENDING lead list; never override robots or mark
// the automated source as collected.
let manualOTM=0;
if(!sourceChecks.some(x=>x.connector==='otm-startups'&&x.status==='collected')){
 const manual=JSON.parse(await readFile(new URL('../data/otm-manually-observed-2026-11-04.json',import.meta.url),'utf8'));
 if(manual.sourceUrl!==OFFICIAL_LISTINGS['otm-startups'].url||
  manual.observationMethod?.includes('Manual review')!==true||
  !Array.isArray(manual.records))throw Error('Manual OTM provenance is invalid');
 for(const item of manual.records){
  if(typeof item.name!=='string'||typeof item.sector!=='string'||
   item.name.trim().length<3)throw Error('Invalid manual OTM listing');
  observeCandidate({
   connector:'otm-startups',externalId:'otm-listing:'+normalizeCompanyName(item.name),
   sourceUrl:manual.sourceUrl,title:item.name+' — OTM startup listing',
   publisher:OFFICIAL_LISTINGS['otm-startups'].publisher,
   excerpt:('Official OTM list names '+item.name+' under '+item.sector+
    '. Manual public-page transcription as of '+manual.observedOn+
    '; exact company identity and current status require review.').slice(0,440),
   companyName:item.name,companyId:null,eventDate:null,
   payload:{recordType:'otm-startup-listing',sector:item.sector,
    ventureWebsite:item.ventureWebsite,entryUrl:null,manualReviewDate:manual.observedOn},
   observedAt
  });
  manualOTM++;
 }
 console.log('MANUAL_SOURCE_OBSERVATIONS otm-startups '+manualOTM+
  ' names: source robots restriction respected; review before publication');
}
const overview=reconcileCatalogs({seed,observations,sourceChecks,observedAt});
const allowed=new Set(overview.additionalResearchParkNames.map(r=>r.slug));
const importRecords=records.filter(r=>allowed.has(r.slug));
const directOps=[];
for(const r of importRecords)directOps.push(...await recordStatements(r));
const candidateOps=[];
const seenCandidates=new Set();
for(const candidate of candidates){
 const prepared=await candidateStatements(candidate,observedAt);
 if(!seenCandidates.has(prepared.id)){
  candidateOps.push(prepared);seenCandidates.add(prepared.id);
 }
}
const report={...overview,collection:{
 researchParkObserved:records.length,additionalResearchParkImportable:importRecords.length,
 candidateObservations:candidates.length,distinctCandidates:seenCandidates.size,
 manuallyTranscribedOTM:manualOTM,
 failures:errors.length,
 sourceCollectionComplete:errors.length===0,
 note:'Observed source listings only; not verified full ecosystem census or automatic approval of new startup identities.'
}};
await mkdir('data',{recursive:true});
await writeFile('data/live-source-catalog.json',JSON.stringify(report,null,2)+'\n');
await writeFile('data/live-source-research-park-import.sql',
 renderSQL(directOps,{label:'New canonical Research Park startup records; explicit review required'}));
await writeFile('data/live-source-candidates.sql',
 renderSQL(candidateOps.map(({sql,values})=>({sql,values})),
  {label:'Official EnterpriseWorks, iVenture and OTM leads: PENDING, never public claims'}));
const summary=[
 '## Live UIUC official catalog collection','',
 '| Metric | Observed |','|---|---:|',
 '| Source pages checked | '+sourceChecks.length+' |',
 '| Pages collected | '+sourceChecks.filter(s=>s.status==='collected').length+' |',
 '| Research Park directory entries | '+records.length+' |',
 '| New Research Park records prepared | '+importRecords.length+' |',
 '| EnterpriseWorks / iVenture / OTM candidate observations | '+candidates.length+' |',
 '| Distinct staged candidates | '+seenCandidates.size+' |',
 '| OTM manually observed review-only leads | '+manualOTM+' |',
 '| Distinct normalized names across catalogs | '+overview.uniqueNormalizedNames+' |',
 '| Identity conflicts | '+overview.sourceIdentityConflicts.length+' |',
 '| Source failures | '+errors.length+' |','',
 'No production writes. New non-Research Park ventures remain pending review.',
 '',...sourceChecks.map(s=>'- '+s.connector+': '+s.status+' ('+s.count+')'+(s.error?' — '+s.error:'')),
 ''
].join('\n');
console.log(summary);
if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,summary+'\n',{flag:'a'});
if(!sourceChecks.some(s=>s.status==='collected'))throw Error('No upstream source could be collected; cannot produce a usable live dataset');
