import {text} from './ingestion.mjs';
import {parseOTMStartupCatalog} from './otm-catalog.mjs';
import {matchCompany,mentionsCompany,normalizeCompanyName} from './source-candidates.mjs';
import {officialSourceUrl,publicVentureWebsite,trustedOfficialProfile,publishedDate} from './source-security.mjs';

export const OFFICIAL_LISTINGS=Object.freeze({
 'research-park-news':{url:'https://researchpark.illinois.edu/news/',publisher:'University of Illinois Research Park'},
 'illinois-news':{url:'https://www.entrepreneurship.illinois.edu/news/news-and-info',publisher:'Entrepreneurship at Illinois'},
 'otm-startups':{url:'https://otm.illinois.edu/browse-technologies-startups/startups',publisher:'University of Illinois Office of Technology Management'},
 'iventure-cohorts':{url:'https://iventure.illinois.edu/startups',publisher:'iVenture Accelerator, Gies College of Business, University of Illinois'},
 'enterpriseworks-directory':{url:'https://researchpark.illinois.edu/category/tenant-directory/enterpriseworks-incubator/',publisher:'University of Illinois Research Park / EnterpriseWorks'}
});
const OFFICIAL_API=Object.freeze({
 'nih-reporter':'https://api.reporter.nih.gov/v2/projects/search',
 'usaspending':'https://api.usaspending.gov/api/v2/search/spending_by_award/'
});
const AGENT='IllinoisVentureRadar/2.0 (independent public research, source discovery only)';
function validateEndpoint(url,allowed){
 const u=new URL(url);
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw Error('Source URL outside HTTPS allowlist');
 const target=new URL(allowed);
 if(u.origin!==target.origin||u.pathname!==target.pathname||u.search)throw Error('Unexpected source endpoint');
 return u.href;
}
async function boundedResponse(url,options={},fetcher=fetch){
 const response=await fetcher(url,{...options,redirect:'error',headers:{'User-Agent':AGENT,...(options.headers||{})},signal:AbortSignal.timeout(20000)});
 if(response.status===403||response.status===429)throw Error(`Source access restricted HTTP ${response.status}; retry later`);
 if(!response.ok)throw Error(`Source HTTP ${response.status}`);
 const raw=await response.text();
 if(raw.length>2500000)throw Error('Source payload exceeds 2.5 MB');
 return raw;
}
async function allowedRobots(url,fetcher){
 const u=new URL(url), robotsUrl=`${u.origin}/robots.txt`;
 const raw=await boundedResponse(robotsUrl,{},fetcher);
 // Conservative fail-closed policy: any general-purpose Disallow that covers this path stops the connector.
 // Treat an unavailable robots.txt as an error instead of ignoring it.
 const groups=raw.split(/(?:^|\n)User-agent\s*:/i).slice(1);
 let restricted=false,delay=1000;
 for(const g of groups){
  const agent=g.split(/\r?\n/)[0]?.trim();
  if(agent!=='*'&&agent?.toLowerCase()!=='illinoisventureradar')continue;
  for(const d of g.matchAll(/(?:^|\n)Disallow\s*:\s*([^\r\n#]*)/gi)){
   const path=d[1].trim();
   if(path&&(new URL(url).pathname===path||new URL(url).pathname.startsWith(path.replace(/\*.*$/,''))))restricted=true;
  }
  const crawl=g.match(/(?:^|\n)Crawl-delay\s*:\s*(\d+)/i);
  if(crawl)delay=Math.max(delay,Number(crawl[1])*1000);
 }
 if(restricted)throw Error('Source robots policy disallows requested path');
 return Math.min(60000,Math.max(1000,delay));
}
export async function officialHTML(connector,fetcher=fetch,{page=1}={}){
 const target=OFFICIAL_LISTINGS[connector];
 if(!target)throw Error('Unknown listing connector');
 officialSourceUrl(target.url,connector);
 if(!Number.isInteger(page)||page<1||page>(connector==='enterpriseworks-directory'?6:1))throw Error('Unsupported source listing page');
 const url=page===1?target.url:target.url+'page/'+page+'/';
 officialSourceUrl(url,connector);
 const delay=await allowedRobots(url,fetcher);
 await new Promise(resolve=>setTimeout(resolve,delay));
 const html=await boundedResponse(url,{},fetcher);
 return {html,url,publisher:target.publisher};
}
function safeArticleUrl(url,base){
 let u;try{u=new URL(url,base);}catch{return null;}
 const trustedOrigin=new URL(base).origin;
 if(u.origin!==trustedOrigin||u.protocol!=='https:'||u.username||u.password||u.hash||u.search||u.port)return null;
 return u.href;
}
export function parseNewsCandidates(html,connector,companies,observedAt){
 const config=OFFICIAL_LISTINGS[connector];
 if(!config||connector==='otm-startups')throw Error('Not an official news source');
 const articles=[...String(html).matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)].map(m=>m[0]);
 // Some university CMS themes do not use article tags. Fall back to heading/link blocks.
 const blocks=articles.length?articles:[...String(html).matchAll(/<h[23]\b[^>]*>[\s\S]*?<\/h[23]>/gi)].map(m=>m[0]);
 const found=[];
 for(const block of blocks.slice(0,80)){
  const titleMarkup=block.match(/<h[123][^>]*>[\s\S]*?<\/h[123]>/i)?.[0]||block;
  const anchor=titleMarkup.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  if(!anchor)continue;
  const href=safeArticleUrl(anchor[1],config.url),title=text(anchor[2]).trim();
  if(!href||title.length<12||title.length>300||href===config.url)continue;
  const mentioned=companies.filter(c=>mentionsCompany(title,c.name));
  if(mentioned.length!==1)continue; // Ambiguous identity is never auto-linked.
  const matched=mentioned[0];
  const rawDate=block.match(/<time[^>]*datetime=["']([^"']+)["']/i)?.[1]
   ||block.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d{2}\b/i)?.[0];
  const eventDate=publishedDate(rawDate);
  found.push({connector,externalId:href,sourceUrl:href,title,publisher:config.publisher,
   excerpt:title,companyName:matched.name,companyId:matched.id,eventDate,
   payload:{recordType:'official-news-mention',listingUrl:config.url},observedAt});
 }
 return [...new Map(found.map(c=>[c.externalId,c])).values()];
}
/**
 * OTM mentions must occur in a bounded official startup listing entry, never in
 * navigation, page text, or a search-result teaser. This errs toward missing a
 * company rather than inventing a university IP licensing relationship.
 */
export function parseOTMCandidates(html,companies,observedAt){
 return parseOTMStartupCatalog(html,companies,observedAt);
}
async function postOfficialJSON(connector,payload,fetcher=fetch){
 const endpoint=validateEndpoint(OFFICIAL_API[connector],OFFICIAL_API[connector]);
 const raw=await boundedResponse(endpoint,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(payload)},fetcher);
 let parsed;try{parsed=JSON.parse(raw);}catch{throw Error('Unparseable official API JSON');}
 if(!parsed||!Array.isArray(parsed.results))throw Error('Unexpected official API response');
 return parsed.results;
}
export async function nihCandidates(company,organizationName,observedAt,fetcher=fetch){
 if(!organizationName||normalizeCompanyName(organizationName).length<5)throw Error('NIH organization identity not reviewed');
 const rows=await postOfficialJSON('nih-reporter',{criteria:{org_names_exact_match:[organizationName]},offset:0,limit:25},fetcher);
 return rows.filter(r=>r&&typeof r==='object'&&r.organization&&typeof r.organization.org_name==='string'&&normalizeCompanyName(r.organization.org_name)===normalizeCompanyName(organizationName)&&/^[1-9]\d*$/.test(String(r.appl_id))&&Number.isSafeInteger(Number(r.appl_id)))
 .slice(0,25).map(r=>{
  const id=String(r.appl_id),url=`https://reporter.nih.gov/project-details/${encodeURIComponent(id)}`;
  const title=String(r.project_title||r.project_num||'NIH project').slice(0,240);
  const amount=typeof r.award_amount==='number'&&Number.isFinite(r.award_amount)&&r.award_amount>=0?r.award_amount:null;
  const amountText=Number.isFinite(amount)&&amount>=0?` Reported award amount: USD ${amount.toFixed(2)}.`:' Award amount not stated.';
  const rawDate=r.award_notice_date||r.project_start_date||null;
  const eventDate=publishedDate(rawDate);
  return {connector:'nih-reporter',externalId:id,sourceUrl:url,title:`${title} (NIH ${r.project_num||id})`,
    publisher:'NIH RePORTER',excerpt:`Recipient: ${r.organization.org_name}; project: ${r.project_num||id}.${amountText}`,
    companyName:company.name,companyId:company.id,eventDate,
    payload:{recordType:'nih-award',organizationName,projectNum:r.project_num||null,applicationId:id,awardAmount:Number.isFinite(amount)?amount:null},observedAt};
 });
}
export async function usaSpendingCandidates(company,uei,observedAt,fetcher=fetch){
 if(!/^[A-Z0-9]{12}$/.test(String(uei)))throw Error('Reviewed UEI must be 12 alphanumeric characters');
 const fields=['Award ID','Recipient Name','Recipient UEI','Award Amount','Start Date','Award Type','generated_internal_id'];
 const rows=await postOfficialJSON('usaspending',{
  filters:{recipient_search_text:[uei]},fields,limit:25,page:1,sort:'Award Amount',order:'desc',
  subawards:false
 },fetcher);
 return rows.filter(r=>r&&typeof r==='object'&&String(r['Recipient UEI']||'').toUpperCase()===uei && r['Award ID']&&r.generated_internal_id).slice(0,25).map(r=>{
  const internalId=String(r.generated_internal_id),awardId=String(r['Award ID']).slice(0,120);
  const amount=typeof r['Award Amount']==='number'&&Number.isFinite(r['Award Amount'])&&r['Award Amount']>=0?r['Award Amount']:null,date=r['Start Date'];
  const eventDate=publishedDate(date);
  const awardType=String(r['Award Type']||'Award type unspecified');
  return {connector:'usaspending',externalId:internalId,sourceUrl:`https://www.usaspending.gov/award/${encodeURIComponent(internalId)}`,
    title:`Federal award ${awardId} (${awardType})`,publisher:'USAspending.gov / U.S. Treasury',
    excerpt:`Recipient UEI ${uei}; award ${awardId}; ${awardType}.${Number.isFinite(amount)?` Reported award amount USD ${amount.toFixed(2)}.`:''}`,
    companyName:company.name,companyId:company.id,eventDate,
    payload:{recordType:'usaspending-award',uei,awardId,awardType,amount:Number.isFinite(amount)?amount:null},observedAt};
 });
}


/**
 * iVenture's primary cohort directory includes for-profit and nonprofit
 * student-led ventures. Participation does not prove University-owned IP,
 * Research Park tenancy, financing, equity investment or commercial success.
 * Only numbered cohort headings and their nested venture headings are parsed.
 */
export function parseIVentureCandidates(html,companies,observedAt){
 const config=OFFICIAL_LISTINGS['iventure-cohorts'],markup=String(html);
 const headings=[...markup.matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
 let cohort=null,cohortLevel=0;
 const candidates=[];
 for(let i=0;i<headings.length;i++){
  const m=headings[i],heading=text(m[2]).trim();
  const label=heading.match(/^iVenture\s+(?:cohort\s+)?(\d{1,2})$/i);
  if(label){cohort=Number(label[1]);cohortLevel=Number(m[1]);continue;}
  if(!cohort||Number(m[1])<=cohortLevel){if(Number(m[1])<=cohortLevel)cohort=null;continue;}
  const name=heading.replace(/\s+/g,' ').trim();
  if(name.length<3||name.length>125||/^(?:home|apply|startups by|about|contact|read more)/i.test(name))continue;
  const between=markup.slice(m.index+m[0].length,headings[i+1]?.index??markup.length).slice(0,1900);
  const paragraph=between.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  const description=paragraph?text(paragraph[1]).slice(0,180):'';
  const anchor=m[2].match(/<a\b[^>]*href=["']([^"']+)["']/i);
  let ventureWebsite=null;
  if(anchor){try{ventureWebsite=publicVentureWebsite(anchor[1]);}catch{/* Not a verified public venture website. */}}
  const matched=matchCompany(name,companies);
  const excerpt=('Official iVenture cohort '+cohort+' listing names '+name+'.'+(description?' Directory description: '+description:'')).slice(0,440);
  candidates.push({
   connector:'iventure-cohorts',externalId:'cohort-'+cohort+':'+normalizeCompanyName(name),
   sourceUrl:config.url,title:name+' — iVenture cohort '+cohort,
   publisher:config.publisher,excerpt,companyName:name,companyId:matched?.id||null,
   eventDate:null,payload:{recordType:'iventure-cohort',cohort,ventureWebsite},
   observedAt
  });
 }
 if(!candidates.length)throw Error('iVenture cohort listing layout changed or produced no venture headings; review before import');
 return [...new Map(candidates.map(c=>[c.externalId,c])).values()];
}


/**
 * EnterpriseWorks' dedicated official tenant category is broader than the
 * Research Park "Startup" filter and can include ventures absent from it.
 * A source taxonomy label supports only directory participation, NOT equity
 * ownership, university IP, founding team identity or revenue.
 */
export function parseEnterpriseWorksCandidates(html,companies,observedAt,listingUrl=OFFICIAL_LISTINGS['enterpriseworks-directory'].url){
 const config=OFFICIAL_LISTINGS['enterpriseworks-directory'];
 const trustedRoot=new URL(config.url),observed=new URL(listingUrl);
 const suffix=observed.pathname.slice(trustedRoot.pathname.length);
 const acceptedPages=['','page/2/','page/3/','page/4/','page/5/','page/6/'];
 if(observed.origin!==trustedRoot.origin||!acceptedPages.includes(suffix)||observed.search||observed.hash)
  throw Error('Unexpected EnterpriseWorks listing page');
 const articles=[...String(html).matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)];
 const found=[];
 for(const match of articles.slice(0,150)){
  const article=match[0];
  const cats=[...article.matchAll(/<a[^>]*rel=["']category tag["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>text(m[1]));
  if(!cats.includes('EnterpriseWorks Incubator')||!cats.includes('Tenant Directory'))continue;
  const h=article.match(/<h2[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>\s*<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  if(!h)continue;
  const name=text(h[2]).trim();
  let profileUrl=null;
  try{profileUrl=trustedOfficialProfile(new URL(h[1],config.url).href);}catch{/* Not a canonical official profile. */}
  if(name.length<3||name.length>125||!profileUrl||profileUrl===config.url||!/^\/[a-z0-9-]+\/$/.test(new URL(profileUrl).pathname))continue;
  const matched=matchCompany(name,companies);
  const excerpt=[name,...cats].join(' · ').slice(0,440);
  found.push({connector:'enterpriseworks-directory',externalId:profileUrl,
   sourceUrl:listingUrl,title:name+' — EnterpriseWorks Incubator directory',
   publisher:config.publisher,excerpt,companyName:name,companyId:matched?.id||null,
   eventDate:null,payload:{recordType:'official-incubator-directory',profileUrl,
   sourceCategories:cats,sourceRelationship:'EnterpriseWorks Incubator directory listing'},observedAt});
 }
 if(!found.length)throw Error('EnterpriseWorks directory produced no qualifying tagged records; review source layout before import');
 return [...new Map(found.map(x=>[x.externalId,x])).values()];
}
