import {digest} from './ingestion.mjs';

export const CONNECTORS=Object.freeze([
 'research-park-1','research-park-2','research-park-3',
 'research-park-news','illinois-news','otm-startups',
 'nih-reporter','usaspending','github-releases'
]);

export function normalizeCompanyName(name){
 return String(name||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
/** Exact normalized name matching only. Ambiguous duplicate names are never auto-linked. */
export function matchCompany(name,companies){
 const key=normalizeCompanyName(name);
 if(!key||key.length<4)return null;
 const matches=companies.filter(c=>normalizeCompanyName(c.name)===key);
 return matches.length===1?matches[0]:null;
}
export function mentionsCompany(title,name){
 const haystack=' '+normalizeCompanyName(title)+' ',needle=' '+normalizeCompanyName(name)+' ';
 return needle.length>=6&&haystack.includes(needle);
}
function officialSource(url,connector){
 let u;try{u=new URL(url);}catch{throw Error('Invalid source URL');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||u.search)throw Error('Noncanonical source URL');
 const hosts={
  'otm-startups':['otm.illinois.edu','www.otm.illinois.edu'],
  'illinois-news':['www.entrepreneurship.illinois.edu','entrepreneurship.illinois.edu'],
  'research-park-news':['researchpark.illinois.edu'],
  'nih-reporter':['reporter.nih.gov'],
  'usaspending':['www.usaspending.gov']
 };
 if(!hosts[connector]?.includes(u.hostname))throw Error('Source outside connector allowlist');
 return u.href;
}
export async function candidateStatements(candidate,observedAt){
 const {connector,externalId,sourceUrl,title,publisher,excerpt,companyName=null,companyId=null,eventDate=null,payload={}}=candidate;
 if(!CONNECTORS.includes(connector)||connector.startsWith('research-park-')&&/^research-park-[123]$/.test(connector)||connector==='github-releases')throw Error('Invalid candidate connector');
 const url=officialSource(sourceUrl,connector);
 if(!externalId||typeof externalId!=='string'||externalId.length>250||!title||!publisher||!excerpt||excerpt.length>1200||title.length>350)throw Error('Invalid source candidate');
 if(companyId!=null&&!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,149}$/.test(companyId))throw Error('Invalid company identity');
 const data={title,publisher,excerpt,companyName,eventDate,payload};
 const hash=await digest(JSON.stringify(data));
 const id=await digest(connector+'\\n'+externalId+'\\n'+hash);
 return {
  id,
  sql:"INSERT INTO source_candidates(id,connector,external_id,source_url,publisher,title,excerpt,company_name,company_id,event_date,observed_at,last_checked,status,content_hash,payload) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'Pending',?,?) ON CONFLICT(id) DO UPDATE SET last_checked=excluded.last_checked",
  values:[id,connector,externalId,url,publisher,title,excerpt,companyName,companyId,eventDate,observedAt,observedAt,hash,JSON.stringify(payload)]
 };
}
/** Only the explicit review action can move a candidate into the public claim/signal tables. */
export async function approvalStatements(candidate,reviewedAt){
 if(candidate.status!=='Pending'||!candidate.company_id)throw Error('An identified pending candidate is required for approval');
 if(!['otm-startups','research-park-news','illinois-news','nih-reporter','usaspending'].includes(candidate.connector))throw Error('Unsupported approval type');
 const sourceId=await digest(candidate.source_url);
 const kind=candidate.connector;
 const value=kind==='otm-startups'?'Appears on the University of Illinois Office of Technology Management list of university IP-based startups':
  kind==='nih-reporter'?('NIH RePORTER project: '+candidate.title):
  kind==='usaspending'?('USAspending award: '+candidate.title):
  ('Official news mention: '+candidate.title);
 const field=kind==='otm-startups'?'university IP startup':kind==='nih-reporter'?'grant':kind==='usaspending'?'government award':'news';
 const classification='Verified factual';
 const claimId=await digest(candidate.company_id+'\\n'+field+'\\n'+value);
 const ops=[
  {sql:"INSERT INTO sources(id,url,title,publisher,type,published_at,retrieved_at,last_checked,hash) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET last_checked=excluded.last_checked",values:[sourceId,candidate.source_url,candidate.title,candidate.publisher,'Reviewed official source',candidate.event_date,candidate.observed_at,reviewedAt,candidate.content_hash]},
  {sql:"INSERT OR IGNORE INTO source_history(id,source_id,hash,observed_at,summary) VALUES(?,?,?,?,?)",values:[await digest(sourceId+candidate.content_hash),sourceId,candidate.content_hash,candidate.observed_at,'Reviewed candidate '+candidate.id]},
  {sql:"INSERT OR IGNORE INTO claims(id,company_id,field,value,classification,status,first_observed,verified_at) VALUES(?,?,?,?,?,'Published',?,?)",values:[claimId,candidate.company_id,field,value,classification,candidate.observed_at,reviewedAt]},
  {sql:"INSERT OR IGNORE INTO evidence(id,claim_id,source_id,excerpt,method,verified_at,relationship) VALUES(?,?,?,?,?,?,'supports')",values:[await digest(claimId+sourceId),claimId,sourceId,candidate.excerpt,'Reviewed exact-identity official record',reviewedAt]}
 ];
 if(kind==='otm-startups')ops.push({sql:"INSERT OR IGNORE INTO affiliations(id,company_id,claim_id,university,type,status) VALUES(?,?,?,?,?,'Source-backed')",values:[claimId,candidate.company_id,claimId,'University of Illinois Urbana-Champaign','OTM-listed university IP startup']});
 if(kind==='research-park-news'||kind==='illinois-news')ops.push({sql:"INSERT OR IGNORE INTO signals(id,company_id,claim_id,category,description,event_date,first_observed,dedup_key,status) VALUES(?,?,?,?,?,?,?,?,'Verified')",values:[claimId,candidate.company_id,claimId,'News',value,candidate.event_date,candidate.observed_at,'reviewed-news:'+candidate.id]});
 return ops;
}
