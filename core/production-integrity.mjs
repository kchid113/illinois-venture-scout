/**
 * Production seed integrity gate.
 *
 * These are provenance and obvious-synthetic-data checks, not independent
 * verification of a third-party publisher's assertions. Source-reported
 * descriptions remain company-reported, never independently validated.
 */
const OFFICIAL_HOST='researchpark.illinois.edu';
const DIRECTORY_PATH=/^\/category\/tenant-directory\/startup\/(?:page\/[1-9]\d*\/)?$/;
const SYNTHETIC_NAME=/^(?:acme(?:\s|$)|example(?:\s|$)|test company(?:\s|$)|sample(?:\s|$)|demo(?:\s|$)|fake(?:\s|$)|synthetic(?:\s|$)|placeholder(?:\s|$)|lorem ipsum)/i;
const AFFILIATIONS=new Set(['Research Park tenant','EnterpriseWorks incubator participant']);
function reject(reason,index,part){throw Error(`Production seed ${part} #${index+1}: ${reason}`);}
function verifiedURL(value,part,index){
 let u;
 try{u=new URL(value);}catch{reject('invalid URL',index,part);}
 if(u.protocol!=='https:'||u.hostname!==OFFICIAL_HOST||u.port||u.username||u.password||u.search||u.hash)reject('source must be a canonical HTTPS Research Park URL',index,part);
 return u;
}
function requireObserved(record,index,part){
 if(typeof record.retrievedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(record.retrievedAt)||Number.isNaN(Date.parse(record.retrievedAt)))reject('missing or invalid retrieval timestamp',index,part);
 if(record.publisher!=='University of Illinois Research Park')reject('unknown data publisher',index,part);
 if(typeof record.name!=='string'||!record.name.trim()||SYNTHETIC_NAME.test(record.name.trim()))reject('placeholder or missing company name',index,part);
 if(record.description!=null&&(typeof record.description!=='string'||SYNTHETIC_NAME.test(record.description.trim())))reject('placeholder or invalid company description',index,part);
 if(typeof record.excerpt!=='string'||!record.excerpt.trim()||(part==='directory'&&!record.excerpt.includes(record.name)))reject('missing company-specific evidence excerpt',index,part);
}
export function assertProductionSeeds(records,profiles){
 if(!Array.isArray(records)||records.length===0||!Array.isArray(profiles))throw Error('Production seed must contain reviewed company and profile arrays');
 const names=new Map(),slugs=new Set();
 records.forEach((r,i)=>{
  requireObserved(r,i,'directory');
  const source=verifiedURL(r.sourceUrl,'directory',i),profile=verifiedURL(r.profile,'directory',i);
  if(!DIRECTORY_PATH.test(source.pathname))reject('source is not an approved startup-directory page',i,'directory');
  if(typeof r.slug!=='string'||!r.slug||profile.pathname!==`/${r.slug}/`)reject('profile and company slug mismatch',i,'directory');
  if(slugs.has(r.slug))reject('duplicate company slug',i,'directory');
  if(!AFFILIATIONS.has(r.affiliation))reject('unsubstantiated affiliation category',i,'directory');
  if(r.classification!=='Company-reported')reject('directory description cannot be marked independently verified',i,'directory');
  if(r.website!=null&&r.website!=='')reject('website must come from separately reviewed profile evidence',i,'directory');
  slugs.add(r.slug);names.set(r.slug,r.name);
 });
 const seen=new Set();
 profiles.forEach((r,i)=>{
  requireObserved(r,i,'profile');
  const profile=verifiedURL(r.profile,'profile',i),source=verifiedURL(r.sourceUrl,'profile',i);
  if(!slugs.has(r.slug)||names.get(r.slug)!==r.name)reject('profile must match a reviewed directory company',i,'profile');
  if(profile.href!==source.href||profile.pathname!==`/${r.slug}/`)reject('profile evidence URL mismatch',i,'profile');
  if(seen.has(r.slug))reject('duplicate reviewed profile',i,'profile');
  if(r.classification!=='Verified factual')reject('profile website is not a reviewed factual field',i,'profile');
  if(r.description||r.sector||r.affiliation)reject('profile may not silently introduce unreviewed claims',i,'profile');
  if(typeof r.website!=='string'||!/^https:\/\/[^/\s]+/i.test(r.website)||/(?:example\.com|localhost|127\.0\.0\.1)/i.test(r.website))reject('unverified or placeholder official website',i,'profile');
  if(!r.excerpt.includes(new URL(r.website).hostname))reject('profile excerpt does not identify reviewed website',i,'profile');
  seen.add(r.slug);
 });
 return {companies:records.length,reviewedProfiles:profiles.length};
}
