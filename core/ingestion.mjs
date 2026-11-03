/** Fixed origin fetching prevents arbitrary URL SSRF. Redirects are rejected. */
export const ORIGIN = 'https://researchpark.illinois.edu';
export const directoryUrl = `${ORIGIN}/category/tenant-directory/startup/`;
export function text(input) {
 const html=String(input??'');
 return html.replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<style\b[\s\S]*?<\/style>/gi,'')
 .replace(/<[^>]+>/g,' ').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,(_,h,d)=>{
  const n=parseInt(h||d,h?16:10);
  return Number.isInteger(n)&&n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'\ufffd';
 }).replace(/&(?:amp|nbsp|quot|apos|lt|gt|rsquo);/gi,m=>({'&amp;':'&','&nbsp;':' ','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&rsquo;':"'"}[m.toLowerCase()]||m))
 .replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
}
export function safeUrl(value,host='researchpark.illinois.edu') {
 if(typeof value!=='string'||value.trim()!==value)throw Error('URL is outside the connector allowlist');
 let u;try{u=new URL(value);}catch{throw Error('URL is outside the connector allowlist');}
 if(u.protocol!=='https:'||u.hostname!==host||u.port||u.username||u.password||u.search||u.hash)
  throw Error('URL is outside the connector allowlist (canonical HTTPS only)');
 return u.href;
}
function directoryPage(value){
 const url=safeUrl(value);
 if(!/^\/category\/tenant-directory\/startup\/(?:page\/[1-5]\/)?$/.test(new URL(url).pathname))throw Error('Invalid official directory page');
 return url;
}
function companyProfile(value){
 const url=safeUrl(value);
 if(!/^\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/i.test(new URL(url).pathname))throw Error('Invalid official company profile');
 return url;
}
export async function digest(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function parseDirectory(html,url,retrievedAt) {
 const sourceUrl=directoryPage(url),records=[];
 for(const match of html.matchAll(/<article\b[\s\S]*?<\/article>/gi)) {
  const article=match[0], title=article.match(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  const cats=[...article.matchAll(/<a[^>]*rel="category tag"[^>]*>([\s\S]*?)<\/a>/gi)].map(m=>text(m[1]));
  if(!title || !cats.includes('Tenant Directory') || !cats.includes('Startup')) continue;
  const name=text(title[2]), profile=companyProfile(title[1]), slug=new URL(profile).pathname.split('/').filter(Boolean).pop();
  if(!name||!slug)throw Error('Empty official directory company identity');
  const raw=text(article.match(/<p>([\s\S]*?)<\/p>/i)?.[1]||'').split(/In The News|Intern Awards|For more information/)[0];
  // Contact preambles and addresses are not research evidence. Only a clear post-address paragraph is accepted.
  let description=raw.replace(/^.*?(?:Hazelwood Drive|South First Street|S\. First Street|S First St\.?|St\. Mary's Road|St\. Mary’s Road)\s*(?:Suite\s*[\w-]+)?\s*(?:Linkedin)?\s*/i,'');
  if(description===raw || description.length<25 || /@/.test(description)) description='';
  description=description.replace(/^(?:(?:Facebook|Instagram|X-twitter|Threads|Linkedin)\s*)+/i,'').replace(/^[,\s]*(?:Champaign,?\s*IL(?:\s*61820)?)[,\s]*/i,'');
  description=description.split(/(?<=\.)\s/).slice(0,2).join(' ').slice(0,450);
  const sector=cats.filter(c=>!['Tenant Directory','Startup','EnterpriseWorks Incubator'].includes(c) && !/^\d/.test(c)).join(' · ')||null;
  records.push({slug,name,profile,description,sector,affiliation:cats.includes('EnterpriseWorks Incubator')?'EnterpriseWorks incubator participant':'Research Park tenant',sourceUrl,title:'Research Park startup directory',publisher:'University of Illinois Research Park',retrievedAt,publicationDate:null,excerpt:[name,...cats].join(' · ').slice(0,220),classification:'Company-reported',website:null});
 }
 if(!records.length) throw Error('No eligible startup records found; parser changes require review');
 const unique=new Map();
 for(const r of records){const old=unique.get(r.slug);if(old&&(old.name!==r.name||old.profile!==r.profile))throw Error('Contradictory directory identity requires review');unique.set(r.slug,r);}
 return [...unique.values()];
}
export async function fetchText(url,fetcher=fetch,{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
 const canonical=safeUrl(url); for(let attempt=0;attempt<3;attempt++) {
  const r=await fetcher(canonical,{redirect:'error',headers:{'User-Agent':'IllinoisVentureRadar/1.0 (independent public research; low-rate metadata only)'},signal:AbortSignal.timeout(20000)});
  if(r.ok){const s=await r.text();if(s.length>2500000) throw Error('Source exceeds size limit'); return s;}
  if(r.status===403 || r.status===429) throw Error(`Source restricted (${r.status}); refresh stopped`);
  if(r.status<500 || attempt===2)throw Error(`Source HTTP ${r.status}`);
  await wait(10000*(attempt+1));
 } throw Error('Fetch failed');
}
/** Respect selected user-agent groups, then longest-path allow/disallow precedence. */
export async function assertRobots(fetcher=fetch){
 const robots=await fetchText(ORIGIN+'/robots.txt',fetcher),groups=[];
 let agents=[],rules=[],hasRules=false;
 const flush=()=>{if(agents.length)groups.push({agents:[...agents],rules:[...rules]});agents=[];rules=[];hasRules=false;};
 for(const raw of robots.split(/\r?\n/)){
  const line=raw.replace(/#.*/,'').trim(),m=line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
  if(!m)continue;
  const key=m[1].toLowerCase(),value=m[2].trim();
  if(key==='user-agent'){if(hasRules)flush();agents.push(value.toLowerCase());}
  else if(agents.length&&['allow','disallow','crawl-delay'].includes(key)){rules.push({key,value});hasRules=true;}
 }
 flush();
 const bot='illinoisventureradar';
 const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&(bot===a||bot.startsWith(a))));
 const applicable=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
 let winner=null,delay=10000;
 for(const g of applicable)for(const rule of g.rules){
  if(rule.key==='crawl-delay'){
   const n=Number(rule.value);if(Number.isFinite(n)&&n>=0)delay=Math.max(delay,Math.min(60000,n*1000));
  }else if(rule.value){
   const pattern=rule.value.endsWith('
/** Invalid pagination is an error, never silently clamped. */
export async function collectDirectory({pages=3,startPage=1,fetcher=fetch,onPage=()=>{},wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 if(!Number.isInteger(pages)||!Number.isInteger(startPage)||pages<1||startPage<1||pages>5||startPage>5||startPage+pages-1>5)
  throw Error('Invalid directory page count or range');
 const delay=await assertRobots(fetcher),all=[];
 for(let page=startPage;page<startPage+pages;page++){
  await wait(delay);
  const url=page===1?directoryUrl:directoryUrl+'page/'+page+'/';
  const html=await fetchText(url,fetcher,{wait});
  const records=parseDirectory(html,url,new Date().toISOString()),
   hash=await digest(html);
  for(const record of records)record.contentHash=hash;
  all.push(...records);await onPage(records);
 }
 const unique=new Map();
 for(const record of all){
  const existing=unique.get(record.slug);
  if(existing&&(existing.name!==record.name||existing.profile!==record.profile))throw Error('Conflicting source directory identities require review');
  unique.set(record.slug,record);
 }
 return [...unique.values()];
}
