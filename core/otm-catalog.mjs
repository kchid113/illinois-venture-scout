import {text} from './ingestion.mjs';
import {matchCompany,normalizeCompanyName} from './source-candidates.mjs';
import {publicVentureWebsite} from './source-security.mjs';

/**
 * The OTM startup page is a sector-grouped directory, not necessarily a list
 * of <article class="startup"> cards. Only bounded entries under recognized
 * official sector headings (or explicit startup cards) are candidates.
 *
 * New names are staged for human review; no OTM row auto-publishes a claim,
 * creates a company, or establishes a current university license or equity.
 */
const LISTING='https://otm.illinois.edu/browse-technologies-startups/startups';
const SECTORS=new Map([
 ['agriculture animal health','Agriculture & Animal Health'],
 ['energy environment','Energy & Environment'],
 ['healthcare life sciences','Healthcare & Life Sciences'],
 ['physical sciences','Physical Sciences'],
 ['software information technologies','Software & Information Technologies']
]);
const INVALID_NAME=/^(?:startups?|overview|company|companies|portfolio|contact|apply|read more|visit website|learn more|download|view all|home|about|search|technologies)$/i;

function companyWebsite(html){
 for(const link of String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)){
  let value=link[1].replaceAll('&amp;','&').trim();
  if(value.startsWith('//'))value='https:'+value;
  if(/^www\.[a-z0-9-]+\./i.test(value))value='https://'+value;
  try{
   const url=publicVentureWebsite(value);
   if(!new URL(url).hostname.endsWith('.illinois.edu'))return url;
  }catch{}
 }
 return null;
}
function officialEntry(value){
 try{
  const url=new URL(value,LISTING);
  if(url.protocol==='https:'&&['otm.illinois.edu','www.otm.illinois.edu'].includes(url.hostname)&&
     !url.username&&!url.password&&!url.port&&!url.hash&&!url.search)
   return url.href;
 }catch{}
 return null;
}
function validName(name){
 return name.length>=3&&name.length<=125&&!INVALID_NAME.test(name)&&
  /^[\p{L}\p{N}]/u.test(name)&&!/[<>@]/.test(name);
}
export function parseOTMStartupCatalog(html,companies,observedAt){
 const source=String(html);
 // Restrict heading discovery to the page's main content. Navigation and
 // footer headings are never startup entries, even if a sector was active.
 const main=source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
 const markup=(main||source).replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi,'')
  .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi,'');
 const found=new Map();
 function add(name,block,sector=null,entryUrl=null){
  name=text(name).replace(/\s+/g,' ').trim();
  if(!validName(name))return;
  const identity=normalizeCompanyName(name);
  if(identity.length<3)return;
  const matched=matchCompany(name,companies);
  // A company website is an identity aid for an administrator, not a source
  // for claims about financing, tenure, current licensing or active status.
  const ventureWebsite=companyWebsite(block);
  const description=text(block).slice(0,240);
  const excerpt=('OTM official startup listing identifies '+name+
   (sector?' under '+sector:'')+'.'+(description?' Source excerpt: '+description:'')).slice(0,440);
  const record={
   connector:'otm-startups',externalId:'otm-listing:'+identity,sourceUrl:LISTING,
   title:name+' — OTM startup listing',publisher:'University of Illinois Office of Technology Management',
   excerpt,companyName:name,companyId:matched?.id||null,eventDate:null,
   payload:{recordType:'otm-startup-listing',sector,ventureWebsite,entryUrl},observedAt
  };
  const old=found.get(identity);
  if(!old)found.set(identity,record);
  else if(old.payload.ventureWebsite&&ventureWebsite&&old.payload.ventureWebsite!==ventureWebsite)
   found.set(identity,{...old,companyId:null,payload:{...old.payload,ventureWebsite:null,ambiguousWebsite:true}});
 }
 // Explicitly marked startup cards on some versions of the official site.
 const cards=[...markup.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)].map(m=>m[0]);
 cards.push(...[...markup.matchAll(/<li\b[^>]*class=["'][^"']*(?:startup|portfolio|venture)[^"']*["'][^>]*>[\s\S]*?<\/li>/gi)].map(m=>m[0]));
 for(const card of cards.slice(0,250)){
  const a=card.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  if(!a)continue;
  const entry=officialEntry(a[1]);
  if(!entry||!new URL(entry).pathname.includes('startup'))continue;
  add(a[2],card,null,entry);
 }
 // The current OTM site groups more than 60 startups by named industries.
 // Extract headings only after a recognized sector heading, not from nav,
 // footer or unrelated university marketing content.
 const headings=[...markup.matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
 let sector=null,level=0;
 for(let i=0;i<headings.length;i++){
  const h=headings[i],name=text(h[2]),depth=Number(h[1]);
  const category=SECTORS.get(normalizeCompanyName(name));
  if(category){sector=category;level=depth;continue;}
  if(!sector)continue;
  if(depth<=level){sector=null;continue;}
  const following=markup.slice(h.index+h[0].length,headings[i+1]?.index??markup.length).slice(0,1700);
  add(name,h[2]+following,sector);
 }
 // Some OTM layouts use a bold company name at the beginning of a paragraph
 // rather than an HTML heading. Keep the same named-sector boundary.
 const sectors=[...headings].filter(h=>SECTORS.has(normalizeCompanyName(text(h[2]))));
 for(let i=0;i<sectors.length;i++){
  const h=sectors[i];
  const sectorName=SECTORS.get(normalizeCompanyName(text(h[2])));
  const following=markup.slice(h.index+h[0].length,sectors[i+1]?.index??markup.length).slice(0,120000);
  const end=following.search(/<(?:footer|nav)\b/i);
  const scoped=end<0?following:following.slice(0,end);
  for(const p of scoped.matchAll(/<p\b[^>]*>\s*<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>[\s\S]*?<\/p>/gi)){
   add(p[1],p[0],sectorName);
  }
 }
 return [...found.values()];
}
