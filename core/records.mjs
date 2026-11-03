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
  const eligible=candidates.filter(c=>c.status==='Published'&&['Verified factual','Company-reported'].includes(c.classification)&&c.evidence?.some(e=>e.source_id&&e.relationship!=='contradicts'));
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
export function report(company){const lines=[`# ${company.name}`,`Research snapshot — ${company.updated_at}`,'','## Executive overview'];for(const c of company.claims){lines.push(`**${c.field}** (${c.classification}${c.status==='Conflicting'?', CONFLICTING':''}): ${c.value} ${c.evidence.map(e=>`[Source](${e.url})`).join(' ')}`);}lines.push('','## Funding and financial information','Information unavailable. No verified funding, revenue or valuation is recorded.','','## Market context','Not verified. Define the target market and obtain reliable market-sizing evidence.','','## Analyst interpretation','A directory listing establishes a documented ecosystem relationship; it does not establish investment quality or commercial traction.','','## Diligence questions','- What is the current product and who uses it?','- Which performance claims have independent validation?','- What financing, customer and IP documentation can the company provide?','','## Sources');for(const s of new Map(company.claims.flatMap(c=>c.evidence).map(e=>[e.source_id,e])).values())lines.push(`- [${s.title}](${s.url}) — ${s.publisher}; retrieved ${s.retrieved_at}; checked ${s.last_checked}`);return lines.join('\n\n');}
export function csv(rows){const cell=v=>'"'+String(v??'Information unavailable').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';return rows.map(row=>row.map(cell).join(',')).join('\r\n');}
export function validCitations(ids,sourceIds){return ids.every(id=>sourceIds.includes(id));}
