import {SUMMARY_SQL,SECTORS_SQL,SIGNAL_ELIGIBILITY} from '@/core/methodology.mjs';
import {database as postgresDatabase,all as queryAll} from '@/db/postgres.mjs';
import {indexCompanyClaims} from '@/core/company-claim-index.mjs';
export const database=postgresDatabase;
export const all=queryAll;
/**
 * Two queries per page or company, regardless of how many claims each holds.
 * The server's Postgres pool is intentionally small for serverless use, so
 * N+1 queries are costly and can cause connection/statement timeouts.
 */
async function claimsForMany(companyIds:string[]){
 if(!companyIds.length)return new Map();
 const companiesIn=companyIds.map(()=>'?').join(',');
 const claims=await all(`SELECT c.* FROM claims c WHERE c.company_id IN (${companiesIn}) AND c.status IN ('Published','Conflicting') AND EXISTS(SELECT 1 FROM evidence e WHERE e.claim_id=c.id AND e.relationship='supports') ORDER BY c.field`,...companyIds);
 if(!claims.length)return indexCompanyClaims(companyIds,[],[]);
 const claimIds=claims.map(c=>String(c.id));
 const claimsIn=claimIds.map(()=>'?').join(',');
 const evidence=await all(`SELECT e.*,s.url,s.title,s.publisher,s.published_at,s.retrieved_at,s.last_checked,s.accessibility,s.type FROM evidence e JOIN sources s ON s.id=e.source_id WHERE e.claim_id IN (${claimsIn})`,...claimIds);
 return indexCompanyClaims(companyIds,claims,evidence);
}
export async function claimsFor(id:string){
 return (await claimsForMany([id])).get(id)||[];
}
export async function companies(query='',sector='',affiliation='',sort='name',page=1){
 const where="WHERE EXISTS(SELECT 1 FROM claims cl JOIN evidence e ON e.claim_id=cl.id AND e.relationship='supports' WHERE cl.company_id=c.id AND cl.status IN ('Published','Conflicting')) AND (c.name ILIKE ? OR EXISTS(SELECT 1 FROM claims q JOIN evidence qe ON qe.claim_id=q.id AND qe.relationship='supports' WHERE q.company_id=c.id AND q.status IN ('Published','Conflicting') AND q.value ILIKE ?)) AND (?='' OR EXISTS(SELECT 1 FROM claims q JOIN evidence qe ON qe.claim_id=q.id AND qe.relationship='supports' WHERE q.company_id=c.id AND q.field='sector' AND q.status IN ('Published','Conflicting') AND q.value ILIKE ?)) AND (?='' OR EXISTS(SELECT 1 FROM claims q JOIN evidence qe ON qe.claim_id=q.id AND qe.relationship='supports' WHERE q.company_id=c.id AND q.status IN ('Published','Conflicting') AND ((q.field='affiliation' AND q.value=?) OR (?='iVenture Accelerator' AND q.field='accelerator' AND q.value LIKE 'iVenture Accelerator cohort % participant') OR (?='EnterpriseWorks Incubator' AND ((q.field='affiliation' AND q.value='EnterpriseWorks incubator participant') OR (q.field='incubator' AND q.value='Listed in the official EnterpriseWorks Incubator directory'))))))";
 const args=[`%${query}%`,`%${query}%`,sector,`%${sector}%`,affiliation,affiliation,affiliation,affiliation];
 const rows=await all(`SELECT c.* FROM companies c ${where} ORDER BY ${sort==='updated'?'c.updated_at DESC':'lower(c.name),c.id'} LIMIT 12 OFFSET ?`,...args,(page-1)*12);
 const count=await all(`SELECT count(*) n FROM companies c ${where}`,...args);
 const byCompany=await claimsForMany(rows.map(c=>String(c.id)));
 return {companies:rows.map(c=>({...c,claims:byCompany.get(String(c.id))||[]})),total:Number(count[0].n)};
}
export async function company(id:string){
 const rows=await all('SELECT * FROM companies WHERE id=?',id);
 return rows[0]?{...rows[0],claims:await claimsFor(id),signals:await signalsFor(id)}:null;
}
export async function signalsFor(companyId?:string){
 const rows=await all(`SELECT s.*,c.name FROM signals s JOIN companies c ON c.id=s.company_id WHERE ${SIGNAL_ELIGIBILITY} ${companyId?'AND s.company_id=?':''} ORDER BY s.event_date DESC NULLS LAST`,...(companyId?[companyId]:[]));
 const byCompany=await claimsForMany([...new Set(rows.map(s=>String(s.company_id)))]);
 return rows.map(s=>({...s,claim:(byCompany.get(String(s.company_id))||[]).find(c=>c.id===s.claim_id)}));
}
export async function summary(){
 const metrics=(await all(SUMMARY_SQL))[0]||{};
 return {...metrics,
  companies:Number(metrics.companies||0),claims:Number(metrics.claims||0),sources:Number(metrics.sources||0),
  signals:Number(metrics.signals||0),conflicts:Number(metrics.conflicts||0),recent:Number(metrics.recent||0),
  sectors:(await all(SECTORS_SQL)).map(s=>({...s,count:Number(s.count)})),
  jobs:await all('SELECT * FROM ingestion_jobs ORDER BY started_at DESC LIMIT 8')
 };
}
