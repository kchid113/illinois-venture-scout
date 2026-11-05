import {publicVentureWebsite} from './source-security.mjs';

const EMAIL=/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i;
const DIRECT_EMAIL=new Set(['founder email','founder contact email','founder contact','founder email address','cofounder email','co-founder email']);
const DIRECT_LINK=new Set(['founder linkedin','founder linkedin profile','cofounder linkedin','co-founder linkedin','founder contact url','founder profile url']);
const FOUNDER_NAME=new Set(['founder','founders','cofounder','co-founder','leadership']);
const normalized=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');

export function safeContactEmail(value){
 const s=String(value||'');
 if(s.length>254||s!==s.trim()||/[\s\u0000-\u001f\u007f]/.test(s)||!EMAIL.test(s))return null;
 return s;
}
export function safeContactWebsite(value){
 try{
  const url=publicVentureWebsite(value);
  if(new URL(url).hostname.endsWith('.example')||new URL(url).hostname.endsWith('.test'))
   return null;
  return url;
 }catch{return null;}
}
/**
 * Display direct founder contact only when its precise value is a published,
 * source-backed claim. A company homepage or university listing is an
 * outreach *starting point*, not proof of personal founder contactability.
 */
export function founderOutreach(company){
 const claims=Array.isArray(company?.claims)?company.claims:[];
 const reliable=claims.filter(c=>c.status==='Published'&&
  c.evidence?.some(e=>e.relationship==='supports'&&e.source_id&&safeContactWebsite(e.url)));
 const direct=[],founders=[];
 for(const claim of reliable){
  const key=normalized(claim.field);
  if(FOUNDER_NAME.has(key))founders.push({value:claim.value,claimId:claim.id});
  if(DIRECT_EMAIL.has(key)){
   const email=safeContactEmail(claim.value);
   if(email)direct.push({kind:'email',label:'Email founder',value:email,url:'mailto:'+email,claimId:claim.id});
  }
  if(DIRECT_LINK.has(key)){
   const url=safeContactWebsite(claim.value);
   if(url)direct.push({kind:'profile',label:'Founder profile',value:url,url,claimId:claim.id});
  }
 }
 const websiteClaim=reliable.find(c=>normalized(c.field)==='website'&&safeContactWebsite(c.value));
 const website=websiteClaim?safeContactWebsite(websiteClaim.value):null;
 const profile=safeContactWebsite(company?.profile);
 const unique=new Set();
 return {
  founders,
  direct:direct.filter(x=>{if(unique.has(x.url))return false;unique.add(x.url);return true;}),
  website,
  websiteClaimId:websiteClaim?.id||null,
  officialProfile:profile,
  hasDirect:direct.length>0,
  verifiedSourceCount:new Set(claims.flatMap(c=>c.evidence||[])
   .filter(e=>e.relationship==='supports'&&e.source_id&&safeContactWebsite(e.url))
   .map(e=>e.source_id)).size
 };
}
/** Stored solely in the signed-in user's existing private workspace. */
export function validatePrivateContact(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid private founder contact');
 const clean=(v,max)=>{
  if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))
   throw Error('Invalid private contact field');
  return v.trim();
 };
 const name=clean(input.name??'',100);
 const email=clean(input.email??'',254);
 const profile=clean(input.profile??'',500);
 const notes=clean(input.notes??'',750);
 if(email&&!safeContactEmail(email))throw Error('Invalid private founder email');
 if(profile&&!safeContactWebsite(profile))throw Error('Invalid private contact profile');
 if(!name&&!email&&!profile&&!notes)throw Error('At least one private contact field is required');
 return {name,email,profile,notes};
}
export function parsePrivateContact(raw){
 if(!raw)return null;
 try{return validatePrivateContact(JSON.parse(raw));}catch{return null;}
}
