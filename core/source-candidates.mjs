import {digest} from './ingestion.mjs';
import {officialSourceUrl,publicVentureWebsite,trustedOfficialProfile,publishedDate} from './source-security.mjs';

export const CONNECTORS=Object.freeze([
 'research-park-1','research-park-2','research-park-3',
 'research-park-news','illinois-news','otm-startups',
 'nih-reporter','usaspending','github-releases','iventure-cohorts','enterpriseworks-directory'
]);

/** Sources that publish an identifiable startup directory or named cohort.
 * News/award/release adapters enrich known identities; they are not startup censuses. */
export const STARTUP_CATALOG_CONNECTORS=Object.freeze([
 'research-park-1','research-park-2','research-park-3','research-park-4','research-park-5',
 'enterpriseworks-directory','iventure-cohorts','otm-startups'
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
export async function candidateStatements(candidate,observedAt){
 const {connector,externalId,sourceUrl,title,publisher,excerpt,companyName=null,companyId=null,eventDate=null,payload={}}=candidate;
 if(!CONNECTORS.includes(connector)||connector.startsWith('research-park-')&&/^research-park-[123]$/.test(connector)||connector==='github-releases')throw Error('Invalid candidate connector');
 const url=officialSourceUrl(sourceUrl,connector);
 const bounded=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
 if(!bounded(externalId,250)||!bounded(title,350)||!bounded(publisher,180)||!bounded(excerpt,1200))
  throw Error('Invalid source candidate metadata');
 if(companyName!=null&&!bounded(companyName,150))throw Error('Invalid company name');
 if(companyId!=null&&!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,149}$/.test(companyId))throw Error('Invalid company identity');
 if(typeof observedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(observedAt)||!publishedDate(observedAt)||Number.isNaN(Date.parse(observedAt)))
  throw Error('Invalid observation timestamp');
 if(eventDate!=null&&publishedDate(eventDate)!==eventDate)throw Error('Invalid event date');
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Invalid source candidate payload');
 const payloadJson=JSON.stringify(payload);
 if(payloadJson.length>8192)throw Error('Source candidate payload exceeds size limit');
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
 if(!['otm-startups','research-park-news','illinois-news','nih-reporter','usaspending','iventure-cohorts','enterpriseworks-directory'].includes(candidate.connector))throw Error('Unsupported approval type');
 const sourceId=await digest(candidate.source_url);
 const kind=candidate.connector;
 const cohort=kind==='iventure-cohorts'?Number(JSON.parse(candidate.payload||'{}').cohort):null;
 if(kind==='iventure-cohorts'&&(!Number.isInteger(cohort)||cohort<1||cohort>30))throw Error('A sourced iVenture cohort number is required');
 const value=kind==='enterpriseworks-directory'?'Listed in the official EnterpriseWorks Incubator directory':kind==='iventure-cohorts'?`iVenture Accelerator cohort ${cohort} participant`:
 kind==='otm-startups'?'Appears on the University of Illinois Office of Technology Management list of university IP-based startups':
  kind==='nih-reporter'?('NIH RePORTER project: '+candidate.title):
  kind==='usaspending'?('USAspending award: '+candidate.title):
  ('Official news mention: '+candidate.title);
 const field=kind==='enterpriseworks-directory'?'incubator':kind==='iventure-cohorts'?'accelerator':kind==='otm-startups'?'university IP startup':kind==='nih-reporter'?'research award':kind==='usaspending'?'government award':'news';
 const classification='Verified factual';
 const claimId=await digest(candidate.company_id+'\\n'+field+'\\n'+value);
 const ops=[
  {sql:"INSERT INTO sources(id,url,title,publisher,type,published_at,retrieved_at,last_checked,hash) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET last_checked=excluded.last_checked",values:[sourceId,candidate.source_url,candidate.title,candidate.publisher,'Reviewed official source',candidate.event_date,candidate.observed_at,reviewedAt,candidate.content_hash]},
  {sql:"INSERT OR IGNORE INTO source_history(id,source_id,hash,observed_at,summary) VALUES(?,?,?,?,?)",values:[await digest(sourceId+candidate.content_hash),sourceId,candidate.content_hash,candidate.observed_at,'Reviewed candidate '+candidate.id]},
  {sql:"INSERT OR IGNORE INTO claims(id,company_id,field,value,classification,status,first_observed,verified_at) VALUES(?,?,?,?,?,'Published',?,?)",values:[claimId,candidate.company_id,field,value,classification,candidate.observed_at,reviewedAt]},
  {sql:"INSERT OR IGNORE INTO evidence(id,claim_id,source_id,excerpt,method,verified_at,relationship) VALUES(?,?,?,?,?,?,'supports')",values:[await digest(claimId+sourceId),claimId,sourceId,candidate.excerpt,'Reviewed exact-identity official record',reviewedAt]}
 ];
 if(kind==='enterpriseworks-directory')ops.push({sql:"INSERT OR IGNORE INTO affiliations(id,company_id,claim_id,university,type,status) VALUES(?,?,?,?,?,'Source-backed')",values:[claimId,candidate.company_id,claimId,'University of Illinois Urbana-Champaign','EnterpriseWorks Incubator directory listing']});
 if(kind==='iventure-cohorts')ops.push({sql:"INSERT OR IGNORE INTO affiliations(id,company_id,claim_id,university,type,status) VALUES(?,?,?,?,?,'Source-backed')",values:[claimId,candidate.company_id,claimId,'University of Illinois Urbana-Champaign',`iVenture cohort ${cohort} participant`]});
 if(kind==='otm-startups')ops.push({sql:"INSERT OR IGNORE INTO affiliations(id,company_id,claim_id,university,type,status) VALUES(?,?,?,?,?,'Source-backed')",values:[claimId,candidate.company_id,claimId,'University of Illinois Urbana-Champaign','OTM-listed university IP startup']});
 if((kind==='research-park-news'||kind==='illinois-news')&&candidate.event_date)ops.push({sql:"INSERT OR IGNORE INTO signals(id,company_id,claim_id,category,description,event_date,first_observed,dedup_key,status) VALUES(?,?,?,?,?,?,?,?,'Verified')",values:[claimId,candidate.company_id,claimId,'News',value,candidate.event_date,candidate.observed_at,'reviewed-news:'+candidate.id]});
 return ops;
}

/** An unmatched cohort venture can be added ONLY by explicit admin review
 * and only when the official cohort listing links to its real website. */
export async function newIVentureCompany(candidate,reviewedAt){
 if(candidate.connector!=='iventure-cohorts'||candidate.status!=='Pending'||candidate.company_id)throw Error('Only unmatched pending iVenture entries can create a venture');
 const payload=JSON.parse(candidate.payload||'{}');
 const url=payload.ventureWebsite;
 if(typeof url!=='string')throw Error('Official listing has no linked venture website; manual identity review required');
 const website=publicVentureWebsite(url);
 const name=String(candidate.company_name||'').trim();
 if(!name||name.length>130||/[\x00-\x1f<>]/.test(name)||!/^[\p{L}\p{N}]/u.test(name))throw Error('Unreviewable venture name');

 const slug=normalizeCompanyName(name).replace(/\s+/g,'-').slice(0,70);
 const companyId='iventure-'+slug+'-'+candidate.id.slice(0,8);
 return {companyId,statement:{sql:"INSERT INTO companies(id,name,profile,first_observed,updated_at) VALUES(?,?,?,?,?)",values:[companyId,name,website,reviewedAt,reviewedAt]}};
}


/**
 * Adding an incubator-listed venture is a human review decision, not an automatic
 * acceptance of a source listing. Source profile is the official directory page.
 */
export async function newEnterpriseWorksCompany(candidate,reviewedAt){
 if(candidate.connector!=='enterpriseworks-directory'||candidate.status!=='Pending'||candidate.company_id)throw Error('Only unmatched EnterpriseWorks directory records can create a venture');
 const payload=JSON.parse(candidate.payload||'{}');
 let official;try{official=trustedOfficialProfile(payload.profileUrl);}catch{throw Error('Venture must have an exact Research Park official profile');}
 const name=String(candidate.company_name||'').trim();
 if(!name||name.length>130||/[\x00-\x1f<>]/.test(name)||!/^[\p{L}\p{N}]/u.test(name))throw Error('Unreviewable venture name');
 const id='enterpriseworks-'+normalizeCompanyName(name).replace(/\s+/g,'-').slice(0,70)+'-'+candidate.id.slice(0,8);
 return {companyId:id,statement:{sql:"INSERT INTO companies(id,name,profile,first_observed,updated_at) VALUES(?,?,?,?,?)",values:[id,name,official,reviewedAt,reviewedAt]}};
}


/**
 * A previously unseen OTM startup requires a human creation decision and a
 * canonical website actually linked from the official listing. The directory
 * alone never proves university ownership, funding, or licensed IP status.
 */
export async function newOTMCompany(candidate,reviewedAt){
 if(candidate.connector!=='otm-startups'||candidate.status!=='Pending'||candidate.company_id)
  throw Error('Only unmatched pending OTM startup entries can create a venture');
 officialSourceUrl(candidate.source_url,'otm-startups');
 const payload=JSON.parse(candidate.payload||'{}');
 if(payload.recordType!=='otm-startup-listing'||typeof payload.ventureWebsite!=='string')
  throw Error('Official OTM listing has no linked venture website; identity review required');
 const website=publicVentureWebsite(payload.ventureWebsite);
 const name=String(candidate.company_name||'').trim();
 if(!name||name.length>130||/[\x00-\x1f<>]/.test(name)||!/^[\p{L}\p{N}]/u.test(name))
  throw Error('Unreviewable OTM startup name');
 const slug=normalizeCompanyName(name).replace(/\s+/g,'-').slice(0,70);
 const companyId='otm-'+slug+'-'+candidate.id.slice(0,8);
 return {companyId,statement:{sql:"INSERT INTO companies(id,name,profile,first_observed,updated_at) VALUES(?,?,?,?,?)",values:[companyId,name,website,reviewedAt,reviewedAt]}};
}
