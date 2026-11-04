import {collectDirectory} from './ingestion.mjs';
import {recordStatements} from './records.mjs';
import {githubReleases} from './github.mjs';
import {releaseStatements} from './github-store.mjs';
import {candidateStatements,CONNECTORS,normalizeCompanyName} from './source-candidates.mjs';
import {officialHTML,parseOTMCandidates,parseNewsCandidates,parseIVentureCandidates,parseEnterpriseWorksCandidates,nihCandidates,usaSpendingCandidates} from './source-adapters.mjs';

const results=async(db,sql,...values)=>(await db.prepare(sql).bind(...values).all()).results;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function runStatements(db,statements){
 if(statements.length)await db.batch(statements.map(s=>db.prepare(s.sql).bind(...s.values)));
}
async function stageCandidate(db,candidate,observedAt){
 const statement=await candidateStatements(candidate,observedAt);
 const existing=await results(db,'SELECT id,status,company_id FROM source_candidates WHERE id=?',statement.id);
 if(existing.length){
  // Newly verified exact matches can attach to an earlier pending observation.
  // Approved/rejected decisions remain immutable across repeat refreshes.
  await db.prepare("UPDATE source_candidates SET last_checked=?,company_id=CASE WHEN status='Pending' AND company_id IS NULL THEN ? ELSE company_id END WHERE id=?")
   .bind(observedAt,candidate.companyId||null,statement.id).run();
  return false;
 }
 await db.prepare(statement.sql).bind(...statement.values).run();return true;
}
function verifiedIdentities(rows,field){
 return rows.filter(x=>x.field===field&&x.classification==='Verified factual'&&x.status==='Published'&&x.relationship==='supports');
}
export async function refreshConnector(db,connector,{fetcher=fetch,now=new Date().toISOString(),directoryCollector=collectDirectory}={}){
 if(!CONNECTORS.includes(connector))throw Error('Unknown refresh connector');
 const leaseToken=crypto.randomUUID(),expiresAt=new Date(Date.parse(now)+15*60*1000).toISOString();
 const lease=await db.prepare(
  'INSERT INTO refresh_leases(name,token,expires_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE refresh_leases.expires_at<=?'
 ).bind(connector,leaseToken,expiresAt,now).run();
 if(lease.meta?.changes!==1)throw Error('A refresh for this source is already running');
 const jobId=crypto.randomUUID();
 let seen=0,imported=0,staged=0,skipped=0,started=false;
 try{
  await db.prepare('INSERT INTO ingestion_jobs(id,connector,status,started_at) VALUES(?,?,?,?)').bind(jobId,connector,'Running',now).run();
  started=true;
  const companies=await results(db,'SELECT id,name,profile FROM companies');
  if(/^research-park-[123]$/.test(connector)){
   const page=Number(connector.at(-1));
   const records=await directoryCollector({pages:1,startPage:page,fetcher});
   seen=records.length;
   for(const r of records){
    const identity=normalizeCompanyName(r.name);
    const existing=companies.filter(c=>c.id===r.slug||c.profile===r.profile||normalizeCompanyName(c.name)===identity);
    if(existing.length && (existing.length!==1||existing[0].id!==r.slug||existing[0].profile!==r.profile||existing[0].name!==r.name)){
     const reason=JSON.stringify({connector,slug:r.slug,sourceUrl:r.sourceUrl,observedAt:now,reason:'A source identifier, profile or name changed; identity review required'}).slice(0,700);
     const reviewId=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('identity:'+r.slug+':'+r.sourceUrl));
     const hex=[...new Uint8Array(reviewId)].map(x=>x.toString(16).padStart(2,'0')).join('');
     await db.prepare("INSERT OR IGNORE INTO review_queue(id,claim_id,reason,status,created_at) VALUES(?,NULL,?,'Pending',?)").bind(hex,reason,now).run();
     skipped++;continue;
    }
    await runStatements(db,await recordStatements(r));
    if(!existing.length)companies.push({id:r.slug,name:r.name,profile:r.profile});
    imported++;
   }
  }else if(['research-park-news','illinois-news','otm-startups','iventure-cohorts','enterpriseworks-directory'].includes(connector)){
   const collected=[];
   if(connector==='enterpriseworks-directory'){
    for(let pageNo=1;pageNo<=6;pageNo++){
     let listing;
     try{listing=await officialHTML(connector,fetcher,{page:pageNo});}
     catch(error){
      if(pageNo>1&&String(error instanceof Error?error.message:error).includes('Source HTTP 404'))break;
      throw error;
     }
     collected.push(...parseEnterpriseWorksCandidates(listing.html,companies,now,listing.url));
    }
   }else{
    const page=await officialHTML(connector,fetcher);
    collected.push(...(connector==='otm-startups'?
     parseOTMCandidates(page.html,companies,now):connector==='iventure-cohorts'?
     parseIVentureCandidates(page.html,companies,now):
     parseNewsCandidates(page.html,connector,companies,now)));
   }
   const candidates=[...new Map(collected.map(c=>[c.externalId,c])).values()];
   seen=candidates.length;
   for(const c of candidates){if(await stageCandidate(db,c,now))staged++;}
  }else if(connector==='nih-reporter'||connector==='usaspending'){
   const field=connector==='nih-reporter'?'nih organization':'uei';
   const mappings=verifiedIdentities(await results(db,
    "SELECT DISTINCT c.id,c.company_id,c.field,c.value,c.classification,c.status,e.relationship,co.name FROM claims c JOIN evidence e ON e.claim_id=c.id JOIN companies co ON co.id=c.company_id WHERE c.field=? AND c.status='Published' AND c.classification='Verified factual' AND e.relationship='supports'",
    field),field);
   // Enrichment must never search awards by a similar-sounding company name alone.
   for(const mapping of mappings){
    const c={id:mapping.company_id,name:mapping.name};
    const candidates=connector==='nih-reporter'?
     await nihCandidates(c,mapping.value,now,fetcher):
     await usaSpendingCandidates(c,mapping.value,now,fetcher);
    seen+=candidates.length;
    for(const candidate of candidates){if(await stageCandidate(db,candidate,now))staged++;}
    await sleep(1200);
   }

  }else if(connector==='github-releases'){
   const mappings=await results(db,
    "SELECT DISTINCT c.id,c.company_id,c.field,c.value,c.status FROM claims c JOIN evidence e ON e.claim_id=c.id WHERE c.field='repository' AND c.status='Published' AND c.classification='Verified factual' AND e.relationship='supports'");
   for(const mapping of mappings){
    const releases=await githubReleases({...mapping,evidence:[{source_id:'verified-identity',relationship:'supports'}]},fetcher);
    seen+=releases.length;
    for(const release of releases){await runStatements(db,await releaseStatements(mapping.company_id,release,now));imported++;}
    await sleep(1200);
   }
  }
  await db.prepare("UPDATE ingestion_jobs SET status='Succeeded',finished_at=?,count=?,message=? WHERE id=?").bind(
   new Date().toISOString(),imported+staged,`Observed ${seen}; imported ${imported}; new pending candidates ${staged}; deferred ${skipped}`,jobId).run();
  return {connector,observed:seen,imported,staged,deferred:skipped,jobId};
 }catch(error){
  if(started)await db.prepare("UPDATE ingestion_jobs SET status='Failed',finished_at=?,count=?,message=? WHERE id=?").bind(
   new Date().toISOString(),imported+staged,String(error instanceof Error?error.message:error).slice(0,450),jobId).run();
  throw error;
 }finally{
  await db.prepare('DELETE FROM refresh_leases WHERE name=? AND token=?').bind(connector,leaseToken).run();
 }
}
