/** Fixed origin fetching prevents arbitrary URL SSRF. Redirects are rejected. */
export const ORIGIN = 'https://researchpark.illinois.edu';
export const directoryUrl = `${ORIGIN}/category/tenant-directory/startup/`;
export function text(html) { return html.replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&amp;/g,'&').replace(/&nbsp;|\u00a0/g,' ').replace(/&#8217;|&rsquo;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim(); }
export function safeUrl(value, host='researchpark.illinois.edu') { const u=new URL(value); if(u.protocol!=='https:' || u.hostname!==host || u.port || u.username || u.password) throw Error('URL is outside the connector allowlist'); return u.href; }
export async function digest(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function parseDirectory(html,url,retrievedAt) {
 const records=[];
 for(const match of html.matchAll(/<article\b[\s\S]*?<\/article>/gi)) {
  const article=match[0], title=article.match(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  const cats=[...article.matchAll(/<a[^>]*rel="category tag"[^>]*>([\s\S]*?)<\/a>/gi)].map(m=>text(m[1]));
  if(!title || !cats.includes('Tenant Directory') || !cats.includes('Startup')) continue;
  const name=text(title[2]), profile=safeUrl(title[1]), slug=new URL(profile).pathname.split('/').filter(Boolean).pop();
  const raw=text(article.match(/<p>([\s\S]*?)<\/p>/i)?.[1]||'').split(/In The News|Intern Awards|For more information/)[0];
  // Contact preambles and addresses are not research evidence. Only a clear post-address paragraph is accepted.
  let description=raw.replace(/^.*?(?:Hazelwood Drive|South First Street|S\. First Street|S First St\.?|St\. Mary's Road|St\. Mary’s Road)\s*(?:Suite\s*[\w-]+)?\s*(?:Linkedin)?\s*/i,'');
  if(description===raw || description.length<25 || /@/.test(description)) description='';
  description=description.replace(/^(?:(?:Facebook|Instagram|X-twitter|Threads|Linkedin)\s*)+/i,'').replace(/^[,\s]*(?:Champaign,?\s*IL(?:\s*61820)?)[,\s]*/i,'');
  description=description.split(/(?<=\.)\s/).slice(0,2).join(' ').slice(0,450);
  const sector=cats.filter(c=>!['Tenant Directory','Startup','EnterpriseWorks Incubator'].includes(c) && !/^\d/.test(c)).join(' · ')||null;
  records.push({slug,name,profile,description,sector,affiliation:cats.includes('EnterpriseWorks Incubator')?'EnterpriseWorks incubator participant':'Research Park tenant',sourceUrl:url,title:'Research Park startup directory',publisher:'University of Illinois Research Park',retrievedAt,publicationDate:null,excerpt:[name,...cats].join(' · ').slice(0,220),classification:'Company-reported',website:null});
 }
 if(!records.length) throw Error('No eligible startup records found; parser changes require review');
 return records;
}
export async function fetchText(url,fetcher=fetch) {
 safeUrl(url); for(let attempt=0;attempt<3;attempt++) {
  const r=await fetcher(url,{redirect:'error',headers:{'User-Agent':'IllinoisVentureRadar/1.0 (independent public research; low-rate metadata only)'},signal:AbortSignal.timeout(20000)});
  if(r.ok){const s=await r.text();if(s.length>2500000) throw Error('Source exceeds size limit'); return s;}
  if(r.status===403 || r.status===429) throw Error(`Source restricted (${r.status}); refresh stopped`);
  if(r.status<500 || attempt===2)throw Error(`Source HTTP ${r.status}`);
  await new Promise(r=>setTimeout(r,10000*(attempt+1)));
 } throw Error('Fetch failed');
}
export async function assertRobots(fetcher=fetch){const robots=await fetchText(`${ORIGIN}/robots.txt`,fetcher);const disallows=[...robots.matchAll(/^Disallow:\s*(\S+)/gmi)].map(m=>m[1]);if(disallows.some(p=>'/category/tenant-directory/startup/'.startsWith(p)))throw Error('Robots policy disallows directory');return Math.max(10000,Number(robots.match(/Crawl-delay:\s*(\d+)/i)?.[1]||10)*1000);}
export async function collectDirectory({pages=3,startPage=1,fetcher=fetch,onPage=()=>{}}={}) {
 const delay=await assertRobots(fetcher);const all=[];
 for(let page=Math.max(1,Math.min(5,Math.floor(startPage)));page<Math.min(6,Math.max(1,Math.min(5,Math.floor(startPage)))+Math.max(1,Math.min(5,Math.floor(pages))));page++) {await new Promise(r=>setTimeout(r,delay));const url=page===1?directoryUrl:`${directoryUrl}page/${page}/`;const html=await fetchText(url,fetcher);const records=parseDirectory(html,url,new Date().toISOString());const contentHash=await digest(html);for(const record of records)record.contentHash=contentHash;all.push(...records);await onPage(records);}
 return [...new Map(all.map(r=>[r.slug,r])).values()];
}
