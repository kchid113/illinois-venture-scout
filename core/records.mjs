import {DEFAULT_WEIGHTS,SCREENING_MIN_COVERAGE,METHODOLOGY_VERSION} from './methodology.mjs';
import {digest,safeUrl} from './ingestion.mjs';
export async function recordStatements(r) {
 safeUrl(r.sourceUrl);safeUrl(r.profile);if(!r.slug||!r.name||!r.retrievedAt)throw Error('Invalid record');
 const s=await digest(r.sourceUrl), now=r.retrievedAt,hash=r.contentHash||await digest(JSON.stringify({...r,retrievedAt:undefined}));const ops=[];
 const add=(sql,...values)=>ops.push({sql,values});
 add('INSERT INTO companies(id,name,profile,first_observed,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=MAX(companies.updated_at,excluded.updated_at)',r.slug,r.name,r.profile,now,now);
 add('INSERT INTO sources(id,url,title,publisher,type,retrieved_at,last_checked,hash,published_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET last_checked=excluded.last_checked,hash=excluded.hash,accessibility=\'Accessible\'',s,r.sourceUrl,r.title,r.publisher,'University directory',now,now,hash,r.publicationDate);
 add('INSERT OR IGNORE INTO source_history(id,source_id,hash,observed_at,summary) VALUES(?,?,?,?,?)',await digest(s+hash),s,hash,now,`Observed source version: ${r.title}`);
 const fields=[['name',r.name,'Verified factual'],['affiliation',r.affiliation,'Verified factual'],['description',r.description,'Company-reported'],['sector',r.sector,'Verified factual'],['website',r.website,'Verified factual']];
 for(const [field,value,classification] of fields){if(!value)continue;const id=await digest(r.slug+field+value);
 add("INSERT OR IGNORE INTO claims(id,company_id,field,value,classification,status,first_observed,verified_at) VALUES(?,?,?,?,?,'Published',?,?)",id,r.slug,field,value,classification,now,now);
 add("INSERT INTO evidence(id,claim_id,source_id,excerpt,method,verified_at) VALUES(?,?,?,?,?,?) ON CONFLICT(claim_id,source_id) DO UPDATE SET verified_at=excluded.verified_at",await digest(id+s),id,s,field==='description'?value.slice(0,180):r.excerpt,'Directory taxonomy / bounded text extraction',now);
 add("UPDATE claims SET status='Conflicting' WHERE company_id=? AND field=? AND status IN ('Published','Conflicting') AND (SELECT count(*) FROM claims WHERE company_id=? AND field=? AND status IN ('Published','Conflicting'))>1",r.slug,field,r.slug,field);
 if(field==='affiliation')add('INSERT OR IGNORE INTO affiliations(id,company_id,claim_id,university,type,status) VALUES(?,?,?,?,?,?)',id,r.slug,id,'University of Illinois Urbana-Champaign',value,'Source-backed');
 }
 return ops;
}
export function thesisFit(company,criteria){
 const weights=Object.fromEntries(Object.entries(DEFAULT_WEIGHTS).map(([k,v])=>{const n=Number(criteria.weights?.[k]??v);return [k,Number.isFinite(n)?Math.max(0,Math.min(100,n)):0];}));
 const fieldNames={sector:['sector'],stage:['stage'],keywords:['description','technology'],progress:['release']};
 const factors=Object.entries(weights).map(([key,weight])=>{
  const requested=String(key==='sector'?criteria.sector||'':key==='stage'?criteria.stage||'':key==='keywords'?criteria.keywords||'':'release');
  const tokens=requested.split(',').map(k=>k.trim().toLowerCase()).filter(Boolean);
  const candidates=company.claims.filter(c=>fieldNames[key].includes(c.field));
  const conflicting=candidates.some(c=>c.status==='Conflicting');
  const eligible=candidates.filter(c=>c.status==='Published'&&['Verified factual','Company-reported'].includes(c.classification)&&c.evidence?.some(e=>e.source_id&&e.relationship==='supports'));
  const known=weight>0&&tokens.length>0&&!conflicting&&eligible.length>0;
  const matched=known?eligible.filter(c=>tokens.some(t=>c.value.toLowerCase().includes(t))):[];
  const reason=weight===0?'Disabled (zero weight)':!tokens.length?'Not specified':conflicting?'Conflicting evidence — requires review':!eligible.length?'No eligible source-backed claim':matched.length?'Matches entered text':'Known evidence does not match entered text';
  return {key,weight,criterion:requested||'Not specified',tokens,known,match:known?matched.length>0:null,reason,evidence:eligible.map(c=>c.id),matchedEvidence:matched.map(c=>c.id),excludedEvidence:candidates.filter(c=>!eligible.includes(c)).map(c=>c.id)};
 });
 const totalWeight=factors.reduce((s,f)=>s+f.weight,0),knownWeight=factors.filter(f=>f.known).reduce((s,f)=>s+f.weight,0),matchedWeight=factors.filter(f=>f.match).reduce((s,f)=>s+f.weight,0);
 const rawCoverage=totalWeight?knownWeight/totalWeight*100:0;
 return {version:METHODOLOGY_VERSION,totalWeight,knownWeight,matchedWeight,coverage:Math.floor(rawCoverage*100)/100,threshold:SCREENING_MIN_COVERAGE,score:knownWeight===0||rawCoverage<SCREENING_MIN_COVERAGE?null:Math.round(matchedWeight/knownWeight*100),factors:factors.map(f=>({...f,contribution:f.known&&knownWeight? (f.match?f.weight/knownWeight*100:0):null}))};
}
export function screeningSnapshot(company,criteria,at=new Date().toISOString()){
 return {version:METHODOLOGY_VERSION,computedAt:at,companyId:company.id,companyName:company.name,criteria:JSON.parse(JSON.stringify(criteria)),result:thesisFit(company,criteria),claims:JSON.parse(JSON.stringify(company.claims))};
}
/** Escape third-party text before including it in Markdown reports. */
function markdownText(value){
 return String(value??'Information unavailable').replace(/\\/g,'\\\\')
  .replace(/([*_[\]#<>!|])/g,'\\$1')
  .replace(/[\r\n\u2028\u2029]+/g,' ');
}
/** Never turn a dangerous source URL into a clickable report citation. */
function citationUrl(value){
 if(typeof value!=='string')return null;
 let url;try{url=new URL(value);}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password||/[\u0000-\u001f]/.test(value))return null;
 return url.href.replace(/\(/g,'%28').replace(/\)/g,'%29');
}
function citedSources(claim){
 return (claim.evidence||[]).filter(e=>e.relationship==='supports'||e.relationship==null)
  .map(e=>citationUrl(e.url)).filter(Boolean).map(url=>'[Source]('+url+')').join(' ');
}
const FINANCE_FIELDS=new Set(['funding','equity funding','grants','grant','research award',
 'government award','contract','government contract','revenue','valuation','financing','funding round']);
export function report(company){
 const claims=Array.isArray(company.claims)?company.claims:[],
  publicClaims=claims.filter(c=>['Published','Conflicting'].includes(c.status)||c.status==null),
  lines=['# '+markdownText(company.name),'Research snapshot — '+markdownText(company.updated_at),'',
   '## Executive overview'];
 for(const c of publicClaims){
  const status=c.status==='Conflicting'?', CONFLICTING':'';
  lines.push('**'+markdownText(c.field)+'** ('+markdownText(c.classification)+status+'): '+
   markdownText(c.value)+' '+citedSources(c));
 }
 lines.push('','## Funding and financial information');
 const financial=publicClaims.filter(c=>FINANCE_FIELDS.has(String(c.field).trim().toLowerCase()) &&
  (c.evidence||[]).some(e=>e.source_id&&(e.relationship==='supports'||e.relationship==null)));
 if(financial.length){
  for(const c of financial){
   lines.push('- **'+markdownText(c.field)+'**'+(c.status==='Conflicting'?' (conflicting)':'')+
    ': '+markdownText(c.value)+' '+citedSources(c));
  }
  lines.push('Other financing types, revenue and valuation must be verified separately; source reports are not proof of equity investment.');
 }else{
  lines.push('Information unavailable. No supported financing, revenue or valuation claims are recorded in the current research snapshot.');
 }
 lines.push('','## Market context',
  'Not verified. Define the target market and obtain reliable market-sizing evidence.','',
  '## Analyst interpretation',
  'A directory listing establishes a documented ecosystem relationship; it does not establish investment quality or commercial traction.','',
  '## Diligence questions',
  '- What is the current product and who uses it?',
  '- Which performance claims have independent validation?',
  '- What financing, customer and IP documentation can the company provide?','','## Sources');
 const sources=new Map();
 for(const c of publicClaims)for(const e of c.evidence||[]){
  if(e.source_id&&e.url&&!sources.has(e.source_id))sources.set(e.source_id,e);
 }
 for(const e of sources.values()){
  const url=citationUrl(e.url);
  if(!url)continue;
  lines.push('- ['+markdownText(e.title||'Original source')+']('+url+') — '+
   markdownText(e.publisher||'Publisher not recorded')+'; retrieved '+
   markdownText(e.retrieved_at)+'; checked '+markdownText(e.last_checked));
 }
 return lines.join('\n\n');
}
/** Guard spreadsheet formulas even after leading whitespace and control characters. */
export function csv(rows){
 const cell=value=>{
  const raw=String(value??'Information unavailable');
  const literal=/^[\s\uFEFF]*[=+@-]/u.test(raw)?"'"+raw:raw;
  return '"'+literal.replaceAll('"','""')+'"';
 };
 return rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
export function validCitations(ids,sourceIds){return ids.every(id=>sourceIds.includes(id));}
