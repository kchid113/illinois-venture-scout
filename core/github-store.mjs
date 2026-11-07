import {digest} from './ingestion.mjs';
import {normalizeRelease} from './github-policy.mjs';

/** Persist only a canonical GitHub release whose event identity is valid. */
export async function releaseStatements(companyId,release,observedAt){
 if(typeof companyId!=='string'||!companyId||!Number.isFinite(Date.parse(observedAt)))
  throw Error('Invalid release company identity or observation timestamp');
 const safe=normalizeRelease(release);
 if(!safe)throw Error('Invalid GitHub release source, event date or ID');
 if(release.description!==safe.description)throw Error('Invalid GitHub release description');
 const sourceId=await digest(safe.url),claimId=await digest(companyId+':github:'+safe.id);
 const hash=await digest(JSON.stringify(safe));
 return [
  {sql:'INSERT INTO sources(id,url,title,publisher,type,published_at,retrieved_at,last_checked,hash) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET last_checked=excluded.last_checked',values:[sourceId,safe.url,safe.name,'GitHub','Repository release',safe.eventDate,observedAt,observedAt,hash]},
  {sql:'INSERT INTO source_history(id,source_id,hash,observed_at,summary) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING',values:[await digest(sourceId+hash),sourceId,hash,observedAt,'Verified release '+safe.id]},
  {sql:"INSERT INTO claims(id,company_id,field,value,classification,status,first_observed,verified_at) VALUES(?,?,'release',?,'Verified factual','Published',?,?) ON CONFLICT DO NOTHING",values:[claimId,companyId,safe.description,observedAt,observedAt]},
  {sql:"INSERT INTO evidence(id,claim_id,source_id,excerpt,method,verified_at,relationship) VALUES(?,?,?,?,?,?,'supports') ON CONFLICT DO NOTHING",values:[await digest(claimId+sourceId),claimId,sourceId,'GitHub release id '+safe.id+'; published_at '+safe.eventDate,'GitHub REST API structured fields',observedAt]},
  {sql:"INSERT INTO signals(id,company_id,claim_id,category,description,event_date,first_observed,dedup_key,status) VALUES(?,?,?,?,?,?,?,?,'Verified') ON CONFLICT DO NOTHING",values:[claimId,companyId,claimId,'Engineering',safe.description,safe.eventDate,observedAt,'github:'+companyId+':'+safe.id]}
 ];
}
