import {digest} from './ingestion.mjs';
export async function releaseStatements(companyId,release,observedAt){
 const sourceId=await digest(release.url),claimId=await digest(`${companyId}:github:${release.id}`);const u=new URL(release.url);if(u.origin!=='https://github.com')throw Error('Invalid release source');const hash=await digest(JSON.stringify(release));
 return [
 {sql:'INSERT INTO sources(id,url,title,publisher,type,published_at,retrieved_at,last_checked,hash) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET last_checked=excluded.last_checked',values:[sourceId,release.url,release.name,'GitHub','Repository release',release.eventDate,observedAt,observedAt,hash]},
 {sql:"INSERT OR IGNORE INTO claims(id,company_id,field,value,classification,status,first_observed,verified_at) VALUES(?,?,'release',?,'Verified factual','Published',?,?)",values:[claimId,companyId,release.description,observedAt,observedAt]},
 {sql:"INSERT OR IGNORE INTO evidence(id,claim_id,source_id,excerpt,method,verified_at) VALUES(?,?,?,?,?,?)",values:[await digest(claimId+sourceId),claimId,sourceId,`GitHub release id ${release.id}; published_at ${release.eventDate}`,'GitHub REST API structured fields',observedAt]},
 {sql:"INSERT OR IGNORE INTO signals(id,company_id,claim_id,category,description,event_date,first_observed,dedup_key,status) VALUES(?,?,?,?,?,?,?,?,'Verified')",values:[claimId,companyId,claimId,'Engineering',release.description,release.eventDate,observedAt,`github:${companyId}:${release.id}`]}
 ];
}
