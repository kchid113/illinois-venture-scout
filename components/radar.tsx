'use client';
import {useEffect,useState,useCallback} from 'react';
import Link from 'next/link';
import {Radar as RadarIcon,LayoutDashboard,Search,Activity,Bookmark,Database,Settings,ArrowUpRight,ArrowRight,ChevronRight,Check,Plus,X,Download,SlidersHorizontal,Grid2X2,List,ShieldCheck,ExternalLink,Menu,BookOpen,UserRound} from 'lucide-react';
import {MetricInfo,Methodology} from './metric-info';
import CompanyOverview, {CompanyContact} from './company-overview';
import CompanyLogo from './company-logo';
import VentureLearning from './venture-learning';
import {METRICS,FIELD_METRICS} from '@/core/methodology.mjs';
import {LOCAL_WORKSPACE_KEY,decodeLocalWorkspace,encodeLocalWorkspace,upsertLocalWorkspace} from '@/core/local-workspace.mjs';
import {DEFAULT_WATCHLIST,watchlistNames,activeWatchlist,createWatchlist,toggleWatchlistCompany,watchlistCompanyIds} from '@/core/watchlists.mjs';
import {savedSearchName,parseSavedSearch,parseSavedThesis} from '@/core/research-preferences.mjs';
import {report,thesisFit,screeningSnapshot} from '@/core/records.mjs';
import {hasDisplayValue,firstDisplayableClaim} from '@/core/display-facts.mjs';
type Evidence={id:string;source_id:string;excerpt:string;url:string;title:string;publisher:string;published_at:string|null;retrieved_at:string;last_checked:string;accessibility:string;method?:string;verified_at?:string;relationship?:string;type?:string};
type Claim={id:string;field:string;value:string;classification:string;status:string;evidence:Evidence[]};
type Company={id:string;name:string;profile?:string;updated_at:string;first_observed:string;claims:Claim[];signals?:Signal[]};
type Signal={id:string;company_id:string;name:string;description:string;category:string;event_date:string|null;first_observed:string;claim?:Claim};
type Summary={lastChecked?:string|null;oldestCheck?:string|null;companies:number;claims:number;sources:number;signals:number;conflicts:number;recent:number;sectors:{name:string;count:number}[];jobs:{id:string;connector:string;status:string;finished_at:string;count:number;message?:string|null}[]};
type Item={kind:string;key:string;value:string};
const nav=[['overview','Home',LayoutDashboard],['discover','Companies',Search],['watchlists','My Research',Bookmark],['learn','Learn',BookOpen]] as const;
const date=(v?:string|null)=>v?new Date(v).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'America/Chicago'}):'—';
async function request<T>(url:string,options?:RequestInit):Promise<T>{const r=await fetch(url,options);const d=await r.json() as T & {error?:string};if(!r.ok)throw Error(d.error||'Request failed');return d;}
function download(name:string,content:string,type='text/markdown'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const emptySummary:Summary={companies:0,claims:0,sources:0,signals:0,conflicts:0,recent:0,sectors:[],jobs:[]};
export default function Radar({section,slug}:{section:string;slug?:string}){
 const [beginnerMode,setBeginnerMode]=useState(true);
 const [summary,setSummary]=useState<Summary>(emptySummary),[companies,setCompanies]=useState<Company[]>([]),[total,setTotal]=useState(0),[selectedCompany,setSelectedCompany]=useState<Company|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [q,setQ]=useState(''),[sector,setSector]=useState(''),[affiliation,setAffiliation]=useState(''),[sort,setSort]=useState('name'),[page,setPage]=useState(1),[cards,setCards]=useState(false),[items,setItems]=useState<Item[]>([]),[sources,setSources]=useState<Evidence[]>([]),[signals,setSignals]=useState<Signal[]>([]),[tab,setTab]=useState('Overview'),[toast,setToast]=useState(''),[menu,setMenu]=useState(false),[watchlist,setWatchlist]=useState(DEFAULT_WATCHLIST),[newList,setNewList]=useState(''),[note,setNote]=useState(''),[reportText,setReportText]=useState('');
 const [founderNavTick,setFounderNavTick]=useState(0);
 const [criteria,setCriteria]=useState({sector:'',stage:'',keywords:'',weights:{sector:35,stage:20,keywords:25,progress:20}});
 const goToFounderContact=()=>{setTab('Founder contact');setFounderNavTick(n=>n+1);};
 useEffect(()=>{
  if(section!=='company'||tab!=='Founder contact'||!selectedCompany)return;
  const frame=requestAnimationFrame(()=>{
   const target=document.getElementById('founder-contact');
   if(!target)return;
   target.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
   target.focus({preventScroll:true});
  });
  return ()=>cancelAnimationFrame(frame);
 },[section,tab,selectedCompany?.id,founderNavTick]);
 const notify=(s:string)=>{setToast(s);setTimeout(()=>setToast(''),3500);};
 const setExperience=(advanced:boolean)=>{setBeginnerMode(!advanced);try{window.localStorage.setItem('ivr-experience-mode',advanced?'advanced':'beginner');}catch{/* Browser preferences are optional. */}};
 useEffect(()=>{let active=true;void Promise.resolve().then(()=>{if(!active)return;try{const storedResearch=decodeLocalWorkspace(window.localStorage.getItem(LOCAL_WORKSPACE_KEY));setItems(storedResearch);setWatchlist(activeWatchlist(storedResearch,localStorage.getItem('ivr-active-watchlist')));const storedMode=localStorage.getItem('ivr-experience-mode');setBeginnerMode(storedMode!=='advanced');if(section==='discover'){const p=new URLSearchParams(window.location.search);setQ(p.get('q')||'');setSector(p.get('sector')||'');setAffiliation(p.get('affiliation')||'');}const saved=sessionStorage.getItem('ivr-saved-search');if(saved){try{const f=parseSavedSearch(saved);setQ(f.q);setSector(f.sector);setAffiliation(f.affiliation);}catch(e){notify(e instanceof Error?e.message:'Unable to reopen this saved search');}finally{sessionStorage.removeItem('ivr-saved-search');}}}catch(e){setError(e instanceof Error?e.message:'Unable to read browser research storage');}});return()=>{active=false;};},[]);
 const load=useCallback(async()=>{setLoading(true);setError('');try{const [s,c]=await Promise.all([request<Summary>('/api/data?view=summary'),request<{companies:Company[];total:number}>(`/api/data?q=${encodeURIComponent(q)}&sector=${encodeURIComponent(sector)}&affiliation=${encodeURIComponent(affiliation)}&sort=${sort}&page=${page}`)]);setSummary(s);setCompanies(c.companies);setTotal(c.total);if(slug)setSelectedCompany(await request<Company|null>(`/api/data?view=company&id=${encodeURIComponent(slug)}`));if(section==='sources')setSources(await request<Evidence[]>('/api/data?view=sources'));if(section==='activity')setSignals(await request<Signal[]>('/api/data?view=signals'));}catch(e){setError(e instanceof Error?e.message:'Unable to load');}finally{setLoading(false);}},[q,sector,affiliation,sort,page,slug,section]);
 useEffect(()=>{const t=setTimeout(()=>void load(),180);return()=>clearTimeout(t);},[load]);
 const item=(kind:string,key:string)=>items.find(i=>i.kind===kind&&i.key===key)?.value;
 async function save(kind:string,key:string,v:string){try{const current=decodeLocalWorkspace(window.localStorage.getItem(LOCAL_WORKSPACE_KEY));const next=upsertLocalWorkspace(current,kind,key,v);window.localStorage.setItem(LOCAL_WORKSPACE_KEY,encodeLocalWorkspace(next));setItems(next);return true;}catch(e){notify(e instanceof Error?e.message:'Browser storage is unavailable or full');return false;}}
 const lists=watchlistNames(items);
 function selectWatchlist(name:string,workspace:Item[]=items){
  const resolved=activeWatchlist(workspace,name);
  setWatchlist(resolved);
  try{window.localStorage.setItem('ivr-active-watchlist',resolved);}
  catch(e){notify(e instanceof Error?e.message:'Could not remember the selected watchlist');}
 }
 function addWatchlist(rawName:string):{ok:boolean;error?:string}{
  try{
   const current=decodeLocalWorkspace(window.localStorage.getItem(LOCAL_WORKSPACE_KEY));
   const created=createWatchlist(current,rawName);
   window.localStorage.setItem(LOCAL_WORKSPACE_KEY,encodeLocalWorkspace(created.items));
   setItems(created.items);
   selectWatchlist(created.name,created.items);
   notify(`Watchlist "${created.name}" created`);
   return {ok:true};
  }catch(e){return {ok:false,error:e instanceof Error?e.message:'Unable to create the watchlist'};}
 }
 const watched=(id:string,list=watchlist):boolean=>{
  try{return watchlistCompanyIds(items,list).includes(id);}
  catch{return false;}
 };
 function toggleWatch(c:Company){
  try{
   // Read the latest persisted data on EVERY click, not a stale render snapshot.
   // Two rapid clicks therefore add then remove rather than losing updates.
   const current=decodeLocalWorkspace(window.localStorage.getItem(LOCAL_WORKSPACE_KEY));
   const result=toggleWatchlistCompany(current,watchlist,c.id);
   window.localStorage.setItem(LOCAL_WORKSPACE_KEY,encodeLocalWorkspace(result.items));
   setItems(result.items);
   selectWatchlist(result.name,result.items);
   notify(result.added?`Saved ${c.name} to ${result.name}`:`Removed ${c.name} from ${result.name}`);
  }catch(e){notify(e instanceof Error?e.message:'Unable to update this watchlist');}
 }
 useEffect(()=>{
  const syncResearch=(event:StorageEvent)=>{
   if(event.key!==LOCAL_WORKSPACE_KEY&&event.key!=='ivr-active-watchlist'&&event.key!==null)return;
   try{
    const latest=decodeLocalWorkspace(window.localStorage.getItem(LOCAL_WORKSPACE_KEY));
    setItems(latest);
    setWatchlist(activeWatchlist(latest,window.localStorage.getItem('ivr-active-watchlist')));
   }catch(e){setError(e instanceof Error?e.message:'Saved research changed but could not be read');}
  };
  window.addEventListener('storage',syncResearch);
  return ()=>window.removeEventListener('storage',syncResearch);
 },[]);
 const info=(metric:keyof typeof METRICS,claims:Claim[]=[]) => <MetricInfo metric={metric} claims={claims} lastChecked={summary.lastChecked}/>;
 const fieldInfo=(c:Company,k:string)=>info((FIELD_METRICS as Record<string,keyof typeof METRICS>)[k]||'verification',c.claims.filter(cl=>cl.field===k));
 const ecosystemClaim=(c:Company)=>firstDisplayableClaim(c.claims,['affiliation','incubator','accelerator','university IP startup']);
 const watchButton=(c:Company)=><button type="button" className={`icon-button ${watched(c.id)?'saved':''}`} title={`${watched(c.id)?'Remove from':'Save to'} ${watchlist}`} aria-label={`${watched(c.id)?'Remove':'Save'} ${c.name} ${watched(c.id)?'from':'to'} ${watchlist}`} onClick={()=>toggleWatch(c)}><Bookmark size={17} fill={watched(c.id)?'currentColor':'none'}/></button>;
 const companyCards=(rows:Company[])=><div className="company-grid">{rows.map(c=><article className="panel company-card clickable-company-card" key={c.id}>
  <Link className="card-surface-link" href={`/companies/${c.id}`} aria-label={`Explore ${c.name} company profile`}/>
  <div className="row card-controls"><CompanyLogo company={c} variant="card"/>{watchButton(c)}</div>
  <h3>{c.name} <ArrowUpRight size={16} aria-hidden="true"/></h3>
  {firstDisplayableClaim(c.claims,['description'])&&<p>{firstDisplayableClaim(c.claims,['description'])?.value}</p>}
  {firstDisplayableClaim(c.claims,['sector'])&&<span className="tag">{firstDisplayableClaim(c.claims,['sector'])?.value}</span>}
  {ecosystemClaim(c)&&<div className="card-relationship"><strong>Illinois connection</strong><p>{ecosystemClaim(c)?.value}</p></div>}
  <div className="card-footer"><span>{c.claims.length} details</span><span className="card-open-action">Explore company <ArrowRight size={13}/></span></div>
 </article>)}</div>;
 const companyDirectoryTable=(rows:Company[])=><div className="table-scroll cb-table-scroll"><table className="cb-company-table"><thead><tr><th>Company</th><th>Industry</th><th>Illinois connection</th><th>Published facts</th><th>Updated</th><th><span className="sr-only">Save company</span></th></tr></thead><tbody>{rows.map(c=><tr className="cb-company-row" key={c.id}><td className="cb-company-name-cell"><Link className="cb-row-hit" href={`/companies/${c.id}`} aria-label={`Open ${c.name} company profile`}/><div className="company-name"><CompanyLogo company={c} variant="table"/><div className="cb-company-copy"><strong>{c.name}</strong>{firstDisplayableClaim(c.claims,['description'])&&<p className="truncate">{firstDisplayableClaim(c.claims,['description'])?.value}</p>}</div></div></td><td>{firstDisplayableClaim(c.claims,['sector'])&&<span className="cb-industry-tag">{firstDisplayableClaim(c.claims,['sector'])?.value}</span>}</td><td>{ecosystemClaim(c)&&<span className="cb-affiliation">{ecosystemClaim(c)?.value}</span>}</td><td className="cb-fact-count">{c.claims.length}</td><td className="cb-updated">{date(c.updated_at)}</td><td className="cb-row-save-cell">{watchButton(c)}</td></tr>)}</tbody></table></div>;
 const companyTable=(rows:Company[])=>cards?companyCards(rows):companyDirectoryTable(rows);
 const empty=(title:string,body:string)=><div className="empty"><RadarIcon size={32}/><h3>{title}</h3><p>{body}</p></div>;
 const heading=(eyebrow:string,title:string,desc:string,action?:React.ReactNode)=><div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{desc}</p></div>{action}</div>;
 const filters=<aside className="cb-filter-rail" aria-label="Company filters">
  <div className="cb-filter-title"><span><SlidersHorizontal size={17}/> Filters</span><button type="button" onClick={()=>{setQ('');setSector('');setAffiliation('');setPage(1);}}>Clear all</button></div>
  <div className="cb-filter-field"><label htmlFor="cb-filter-search">Company or keyword</label><div className="search-field"><Search size={16}/><input id="cb-filter-search" type="search" aria-label="Search companies" placeholder="Name or technology" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/></div></div>
  <div className="cb-filter-field"><label htmlFor="cb-filter-sector">Industry / sector</label><select id="cb-filter-sector" aria-label="Sector filter" value={sector} onChange={e=>{setSector(e.target.value);setPage(1);}}><option value="">All industries</option>{Array.from(new Set(summary.sectors.flatMap(s=>s.name.split(' · ')))).map(s=><option key={s}>{s}</option>)}</select></div>
  <div className="cb-filter-field"><label htmlFor="cb-filter-affiliation">Illinois relationship</label><select id="cb-filter-affiliation" aria-label="Affiliation filter" value={affiliation} onChange={e=>{setAffiliation(e.target.value);setPage(1);}}><option value="">Any affiliation</option><option>EnterpriseWorks Incubator</option><option>Research Park tenant</option><option>iVenture Accelerator</option></select></div>
  <div className="cb-filter-shortcuts"><span>Quick filters</span><button type="button" className={affiliation==='EnterpriseWorks Incubator'?'active':''} onClick={()=>{setAffiliation(affiliation==='EnterpriseWorks Incubator'?'':'EnterpriseWorks Incubator');setPage(1);}}>EnterpriseWorks</button><button type="button" className={affiliation==='iVenture Accelerator'?'active':''} onClick={()=>{setAffiliation(affiliation==='iVenture Accelerator'?'':'iVenture Accelerator');setPage(1);}}>iVenture</button><button type="button" className={affiliation==='Research Park tenant'?'active':''} onClick={()=>{setAffiliation(affiliation==='Research Park tenant'?'':'Research Park tenant');setPage(1);}}>Research Park</button></div>
  <p className="cb-filter-explainer">Only documented company relationships and available industry categories are searchable.</p>
 </aside>;
 return <div className="app"><aside id="radar-sidebar" className={menu?'sidebar open':'sidebar'}><Link className="brand" href="/"><span className="brandmark illinois-i" aria-hidden="true">I</span><span>Illinois<span className="brand-sub">VENTURE RADAR</span></span></Link><div className="workspace-label"><span className="tiny-dot"/> INDEPENDENT · UIUC ECOSYSTEM <ChevronRight size={14}/></div><nav>{nav.map(([id,label,Icon])=><Link className={section===id?'nav-link active':'nav-link'} href={id==='overview'?'/':`/${id}`} onClick={()=>setMenu(false)} key={id}><Icon size={18}/>{label}{id==='discover'&&summary.companies>0?<span className="nav-count">{summary.companies}</span>:null}</Link>)}</nav><div className="sidebar-bottom"><div className="method-card"><div className="method-mark"><ShieldCheck size={15}/> RESEARCH STANDARD</div><strong>Evidence, not speculation.</strong><p>Inspect the original documentation behind published facts.</p><Link href="/methodology">View methodology <ArrowUpRight size={13}/></Link></div><Link className="nav-link" href="/settings"><Settings size={18}/>Settings</Link><div className="account"><div className="privacy-indicator"><ShieldCheck size={16}/></div><div>Private research<small>Stored in this browser</small></div></div></div></aside>
 <div className="main-shell"><header className="topbar"><button className="mobile-toggle" aria-label="Toggle navigation" aria-expanded={menu} aria-controls="radar-sidebar" onClick={()=>setMenu(!menu)}><Menu size={20}/></button><div className="topbar-context"><span className="context-prefix">ILLINOIS VENTURE RADAR</span><ChevronRight size={13}/><strong>{section==='company'?'Company brief':section==='methodology'?'Data methodology':section==='research'?'Investment interests':section==='sources'?'Source library':section==='activity'?'Activity feed':nav.find(n=>n[0]===section)?.[1]||'Settings'}</strong></div><form className="cb-global-search" action="/discover" method="GET" role="search"><Search size={16}/><input type="search" name="q" maxLength={120} aria-label="Search all Illinois companies" placeholder="Search companies, sectors and technologies"/><button type="submit" aria-label="Run company search"><ArrowRight size={17}/></button></form><div className="top-actions"><div className="experience-toggle" role="group" aria-label="Research experience"><button type="button" className={beginnerMode?'active':''} aria-pressed={beginnerMode} onClick={()=>setExperience(false)}>Beginner</button><button type="button" className={!beginnerMode?'active':''} aria-pressed={!beginnerMode} onClick={()=>setExperience(true)}>Advanced</button></div><Link href="/methodology" className="icon-button" aria-label="Data methodology"><BookOpen size={17}/></Link></div></header><main>
 {error&&<div role="alert" className="error">{error} <button onClick={()=>void load()}>Retry</button></div>}
 
  {section==='overview'&&<>
  <section className="premium-hero" aria-label="Illinois Venture Radar research overview">
    <div className="premium-hero-main">
      <div className="premium-overline"><span className="premium-led"/> UNIVERSITY OF ILLINOIS / STARTUP INTELLIGENCE <span className="premium-overline-divider"/> INDEPENDENT RESEARCH</div>
      <h1>Discover Illinois companies.<br/><span>Research with context.</span></h1>
      <p>Browse a focused directory of Illinois-connected startups. Explore company profiles, original sources, and the organizations behind them.</p>
      <form className="home-search premium-search" action="/discover" method="GET" role="search"><Search size={19}/><input type="search" name="q" maxLength={120} aria-label="Search startups, industries or technologies" placeholder="Search startups, sectors, technology…"/><button type="submit">Search <ArrowRight size={16}/></button></form>
      <div className="premium-hero-quicklinks"><Link href="/discover">Browse all companies <ArrowUpRight size={14}/></Link><Link href="/learn">New to venture capital? <ArrowUpRight size={14}/></Link></div>
    </div>
    <aside className="premium-hero-stats" aria-label="Database coverage">
      <div className="premium-stats-top"><span>DATASET / LIVE</span><span className="premium-online"><span className="tiny-dot"/> PUBLIC</span></div>
      <div className="premium-stat-primary"><span className="premium-stat-number">{loading?'—':summary.companies}</span><span>documented companies</span></div>
      <div className="premium-stat-grid">
        <div><strong>{loading?'—':summary.claims}</strong><span>SOURCED FACTS</span></div>
        <div><strong>{loading?'—':summary.sources}</strong><span>RESEARCH SOURCES</span></div>
      </div>
      <div className="premium-stats-foot">LAST SOURCE CHECK <strong>{date(summary.lastChecked)}</strong></div>
    </aside>
  </section>
  <section className="home-company-spotlight" aria-labelledby="home-company-heading">
    <div className="premium-section-heading home-company-heading">
      <div><div className="eyebrow">STARTUP DIRECTORY / ILLINOIS ECOSYSTEM</div><h2 id="home-company-heading">Companies to explore</h2><p>Source-linked Illinois company records, shown alphabetically—not ranked by investment potential.</p></div>
      <Link className="button home-browse-all" href="/discover">Browse all {loading?'':summary.companies} companies <ArrowRight size={16}/></Link>
    </div>
    <div className="cb-home-table">{loading?<div className="panel padded loading" role="status">Loading company profiles…</div>:companies.length?companyDirectoryTable(companies.slice(0,8)):empty('No company profiles available','View the complete directory for additional records.')}</div>
  </section>
  <div className="premium-action-grid">
    <Link className="premium-action" href="/discover"><div className="premium-action-icon"><Search size={19}/></div><span><strong>Explore startups</strong><small>Find companies and technology</small></span><ArrowUpRight size={16}/></Link>
    <Link className="premium-action" href="/learn"><div className="premium-action-icon"><BookOpen size={19}/></div><span><strong>Learn about startups</strong><small>A simple guide to venture research</small></span><ArrowUpRight size={16}/></Link>
    <Link className="premium-action" href="/watchlists"><div className="premium-action-icon"><Bookmark size={19}/></div><span><strong>My research</strong><small>Keep a focused shortlist</small></span><ArrowUpRight size={16}/></Link>
  </div>
  <section className="premium-section">
    <div className="premium-section-heading"><div><div className="eyebrow">01 / ECOSYSTEM COVERAGE</div><h2>Explore by sector</h2><p>Source-reported categories, not inferred market segments.</p></div><Link href="/discover">Complete directory <ArrowUpRight size={15}/></Link></div>
    <div className="premium-sector-grid">{summary.sectors.slice(0,6).map((sector,i)=><Link className="premium-sector" key={sector.name} href={'/discover?sector='+encodeURIComponent(sector.name)}><span className="premium-sector-index">0{i+1}</span><strong>{sector.name}</strong><span className="premium-sector-count">{sector.count} {sector.count===1?'company':'companies'}</span><ArrowUpRight size={16}/></Link>)}</div>
    {!loading&&summary.sectors.length===0&&<div className="panel padded">No verified sector categories available yet. <Link href="/discover">Explore companies</Link>.</div>}
  </section>
  <div className="premium-disclaimer"><ShieldCheck size={14}/> Public, independent research · Missing funding and traction information is not evidence of zero activity.</div>
</>}
  {section==='discover'&&<>
 {heading('ILLINOIS STARTUP DIRECTORY','Company discovery','Search startups, filter documented Illinois relationships, and open company profiles for deeper research.',
  <button type="button" onClick={async()=>{if(await save('search',savedSearchName({q,sector,affiliation}),JSON.stringify({q,sector,affiliation})))notify('Search saved in My Research');}}><Bookmark size={16}/>Save search</button>)}
 <div className="cb-directory-tabs"><span className="cb-directory-tab active"><Database size={15}/> Companies</span><Link className="cb-directory-tab" href="/watchlists"><Bookmark size={15}/> Saved companies</Link><Link className="cb-directory-tab" href="/learn"><BookOpen size={15}/> Research guide</Link></div>
 <div className="cb-directory-layout">
  {filters}
  <section className="panel cb-results-panel">
   <div className="results-bar cb-results-bar"><div className="cb-results-count"><strong>{loading?'…':total}</strong><span> companies</span>{(q||sector||affiliation)&&<small> · Filtered results</small>}</div><div className="row cb-results-controls"><label htmlFor="cb-results-sort" className="cb-sort-label">Sort</label><select id="cb-results-sort" aria-label="Sort companies" value={sort} onChange={e=>setSort(e.target.value)}><option value="name">Name A–Z</option><option value="updated">Recently updated</option></select><div className="cb-view-switch" role="group" aria-label="Company view"><button type="button" className={!cards?'selected':''} aria-label="Table view" aria-pressed={!cards} onClick={()=>setCards(false)}><List size={17}/></button><button type="button" className={cards?'selected':''} aria-label="Card view" aria-pressed={cards} onClick={()=>setCards(true)}><Grid2X2 size={17}/></button></div></div></div>
   {(q||sector||affiliation)&&<div className="cb-active-filters">{q&&<button type="button" onClick={()=>{setQ('');setPage(1);}}>Search: {q} <X size={12}/></button>}{sector&&<button type="button" onClick={()=>{setSector('');setPage(1);}}>{sector} <X size={12}/></button>}{affiliation&&<button type="button" onClick={()=>{setAffiliation('');setPage(1);}}>{affiliation} <X size={12}/></button>}</div>}
   {loading?<div className="loading">Loading company records…</div>:companies.length?companyTable(companies):empty('No companies match','Try another keyword or clear your filters.')}
   <div className="pagination"><span>Page {page} of {Math.max(1,Math.ceil(total/12))}</span><div className="row"><button disabled={page===1} onClick={()=>setPage(page-1)}>Previous</button><button disabled={page*12>=total} onClick={()=>setPage(page+1)}>Next <ChevronRight size={14}/></button></div></div>
  </section>
 </div>
 </>}
 {section==='company'&&(loading?<div className="loading">Loading company evidence…</div>:selectedCompany?<><Link className="backlink" href="/discover">← Back to discovery</Link><div className="profile-heading"><CompanyLogo company={selectedCompany} variant="profile"/><div><div className="eyebrow">COMPANY INTELLIGENCE</div><h1>{selectedCompany.name}</h1><p>Illinois-connected company · Updated {date(selectedCompany.updated_at)}</p></div><div className="row profile-actions"><button type="button" className="button contact-jump" aria-pressed={tab==='Founder contact'} onClick={goToFounderContact}><UserRound size={16}/>Founder contact <ArrowRight size={15}/></button><button className="primary" onClick={()=>void toggleWatch(selectedCompany)}><Bookmark size={16}/>{watched(selectedCompany.id)?'Saved':'Watch company'}</button></div></div><div className="cb-profile-facts">{firstDisplayableClaim(selectedCompany.claims,['sector'])&&<div><span>Industry</span><strong>{firstDisplayableClaim(selectedCompany.claims,['sector'])?.value}</strong></div>}{ecosystemClaim(selectedCompany)&&<div><span>Illinois connection</span><strong>{ecosystemClaim(selectedCompany)?.value}</strong></div>}{firstDisplayableClaim(selectedCompany.claims,['stage'])&&<div><span>Stage</span><strong>{firstDisplayableClaim(selectedCompany.claims,['stage'])?.value}</strong></div>}{selectedCompany.profile&&<a href={selectedCompany.profile} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> Open original listing</a>}</div><div className="tabs">{['Overview','Founder contact','Signals','Research','Sources'].map(t=><button key={t} className={tab===t?'active':''} onClick={()=>{setTab(t);if(t==='Research'){setNote(item('note',selectedCompany.id)||'');setReportText(item('report',selectedCompany.id)||report(selectedCompany));}}}>{t}</button>)}</div>{tab==='Overview'&&<CompanyOverview key={selectedCompany.id} company={selectedCompany}
 
 onSources={()=>setTab('Sources')}
 onSignals={()=>setTab('Signals')}
 onFounderContact={goToFounderContact}/>}
{tab==='Founder contact'&&<div className="founder-contact-view">
  <CompanyContact key={selectedCompany.id} company={selectedCompany}
   privateValue={item('contact',selectedCompany.id)}
   onSave={async contactValue=>{const ok=await save('contact',selectedCompany.id,contactValue);if(ok)notify('Contact saved in this browser');return ok;}}
   />
 </div>}
{tab==='Signals'&&<section className="panel"><div className="panel-heading"><h2>Recorded developments {info('signals')}</h2></div>{selectedCompany.signals?.length?selectedCompany.signals.map(s=><div className="padded" key={s.id}>{s.description}  {info('signals',s.claim?[s.claim]:[])} · Event {date(s.event_date)} · Observed {date(s.first_observed)}</div>):empty('No verified developments recorded','A directory refresh is not a product launch or funding event. New developments appear only with supporting evidence.')}</section>}{tab==='Sources'&&<section className="panel padded"><h2>Original company sources</h2><p className="muted">Open the original publisher or company record for each documented fact.</p>{selectedCompany.claims.filter(c=>hasDisplayValue(c.value)).map(c=><div className="claim-row" key={c.id}><div className="row"><span className="eyebrow">{c.field}</span>{c.status==='Conflicting'&&<small>Conflicting information</small>}</div><p>{c.value}</p>{c.evidence.filter(e=>e.relationship==='supports'&&e.url).map(e=><a className="source-link" key={e.id} href={e.url} target="_blank" rel="noopener noreferrer"><span>{e.publisher} · Open original source</span><ExternalLink size={14}/></a>)}</div>)}</section>}{tab==='Research'&&<div className="profile-grid"><section className="panel padded"><h2>Research notes</h2><p className="muted">Saved only in this browser. Other people using this device and browser profile may read them.</p><div>Research status {info('workflow')}</div><label><span className="sr-only">Research status</span><select value={item('status',selectedCompany.id)||'Watching'} onChange={e=>void save('status',selectedCompany.id,e.target.value)}>{['Watching','Researching','Further diligence','Archived'].map(s=><option key={s}>{s}</option>)}</select></label><textarea className="notes" aria-label="Browser-saved research notes" placeholder="Record your observations, questions, and next steps…" value={note} onChange={e=>setNote(e.target.value)}/><button className="primary" onClick={async()=>{if(await save('note',selectedCompany.id,note))notify('Note saved');}}>Save notes <Check size={15}/></button><hr/><h2>Editable research report</h2><p className="muted">Source links remain in the Markdown. Your edits are analyst-authored.</p><textarea className="report-editor" aria-label="Research report" value={reportText} onChange={e=>setReportText(e.target.value)}/><div className="row"><button onClick={async()=>{if(await save('report',selectedCompany.id,reportText))notify('Report saved');}}>Save report</button><button onClick={()=>download(`${selectedCompany.id}-research.md`,reportText)}><Download size={15}/>Export Markdown</button></div></section><section className="panel padded"><h2>Questions worth asking</h2><ol className="questions"><li>What is the current product, and who uses it?</li><li>Which technical claims have independent validation?</li><li>What customer, funding, and IP evidence is available?</li><li>What remains to be demonstrated?</li></ol><div className="hint">Analyst prompts, not factual claims about this company.</div></section></div>}</>:empty('Company not found','Return to Discover to select an imported company.'))}
 {section==='watchlists'&&<><div className="research-shortcuts"><div><div className="eyebrow">YOUR RESEARCH WORKSPACE</div><h1>My Research</h1><p>Save interesting startups, organize questions, and explore how well available evidence fits your interests. Saved only in this browser.</p></div><div className="row"><Link className="button" href="/research">My investment interests <ArrowRight size={15}/></Link><Link className="button" href="/settings">Backup my research</Link></div></div><Watchlists heading={heading} lists={lists} watchlist={watchlist} setWatchlist={selectWatchlist} newList={newList} setNewList={setNewList} onCreate={addWatchlist} items={items} render={companyTable} empty={empty}/></>}
 {section==='activity'&&<>{heading('OBSERVABLE DEVELOPMENTS','Activity feed','Dated events with supporting evidence. A source retrieval is not a company event.',info('signals'))}<section className="panel">{signals.length?signals.map(s=><div key={s.id} className="radar-row"><Activity size={20}/><div><Link href={`/companies/${s.company_id}`}>{s.name}</Link><p>{s.description}  {info('signals',s.claim?[s.claim]:[])}</p><small>Event {date(s.event_date)} · Observed {date(s.first_observed)}</small></div></div>):empty('No verified events yet','Company profiles are available now. Funding, product, research, and engineering events will appear as they are verified.')}</section></>}
 {section==='research'&&<>{heading('MY RESEARCH','My investment interests','Screen UIUC-connected ventures against your own investment criteria—not predictions of return.')}<div className="profile-grid"><section className="panel padded"><h2>Investment thesis {info('thesis')}</h2><p className="muted">Enter your own screening preferences; no company is preselected or recommended. Unknown factors stay unknown.</p><div className="form-grid"><label>Preferred sector<input value={criteria.sector} onChange={e=>setCriteria({...criteria,sector:e.target.value})}/></label><label>Stage<input placeholder="Not specified" value={criteria.stage} onChange={e=>setCriteria({...criteria,stage:e.target.value})}/></label></div><label>Technology keywords (comma separated)<input value={criteria.keywords} onChange={e=>setCriteria({...criteria,keywords:e.target.value})}/></label><h3>Factor weights {info('weights')}</h3>{Object.entries(criteria.weights).map(([k,w])=><label className="weight" key={k}><span>{k}</span><input type="range" min="0" max="100" value={w} onChange={e=>setCriteria({...criteria,weights:{...criteria.weights,[k]:+e.target.value}})}/><strong>{w}</strong></label>)}<button className="primary" onClick={async()=>{if(await save('thesis','My thesis',JSON.stringify(criteria)))notify('Thesis saved');}}>Save thesis</button>{item('thesis','My thesis')&&<button onClick={()=>{try{setCriteria(parseSavedThesis(item('thesis','My thesis')!));notify('Saved thesis loaded');}catch(e){notify(e instanceof Error?e.message:'Could not restore saved thesis');}}}>Load saved thesis</button>}<hr/><h2>Screening results {info('thesis')} {info('ranking')}</h2><p className="muted">First page, A–Z; not a ranked universe. Fit is withheld below 50% unrounded weighted evidence coverage. Higher fit means closer text alignment, not greater investment merit.</p>{companies.map(c=>{const fit=thesisFit(c,criteria);return <details className="fit" key={c.id}><summary><span>{c.name}</span><strong>{fit.score===null?'Insufficient evidence':`${fit.score}% fit`}</strong><small>{fit.coverage}% coverage</small></summary><div className="fit-explanation"><p><strong>Calculation:</strong> matched weight {fit.matchedWeight} ÷ known weight {fit.knownWeight} × 100{fit.score===null?' → withheld':` → ${fit.score}% (rounded)`}. Coverage: {fit.knownWeight} ÷ {fit.totalWeight} × 100 = {fit.coverage}%.</p><p>Method {fit.version} · 50% cutoff is a product safeguard, not an empirically validated threshold. {info('matching')}</p></div>{fit.factors.map(f=><div className="factor-detail" key={f.key}><strong>{f.key} · weight {f.weight}</strong><p>Criterion: {f.criterion}</p><p>{f.reason} · Contribution: {f.contribution===null?'Unknown / excluded':`${f.contribution.toFixed(2)} percentage points`}</p><div>Observed claims: {f.evidence.length?f.evidence.map((id:string)=><span key={id}><small>{id.slice(0,12)} · {c.claims.find(cl=>cl.id===id)?.classification}{f.matchedEvidence.includes(id)?' · matched':''}</small></span>):'None eligible'}</div>{f.excludedEvidence.length>0&&<p>Excluded claims (inspect evidence): {f.excludedEvidence.map((id:string)=><span key={id}></span>)}</p>}</div>)}<div className="row snapshot-actions"><button onClick={async()=>{const snapshot=screeningSnapshot(c,criteria);if(await save('thesis',`snapshot:${c.id}`,JSON.stringify(snapshot)))notify('Evidence snapshot saved in this browser');}}>Save evidence snapshot</button><button onClick={()=>download(`${c.id}-screening.json`,JSON.stringify(screeningSnapshot(c,criteria),null,2),'application/json')}>Export calculation</button></div></details>;})}</section><aside><section className="panel padded"><h2>Saved searches {info('filters')}</h2>{items.filter(i=>i.kind==='search').length?items.filter(i=>i.kind==='search').map(i=><Link className="saved-search" key={i.key} href="/discover" onClick={()=>sessionStorage.setItem('ivr-saved-search',i.value)}><Search size={15}/>{i.key}<ArrowRight size={15}/></Link>):<p className="muted">Save a filter from Discover to return to it later.</p>}</section><section className="panel padded notes-list"><h2>Saved screening snapshots</h2><p className="muted">Exact evidence and criteria at the time of saving. Older saved theses contain preferences only.</p>{items.filter(i=>i.kind==='thesis'&&i.key.startsWith('snapshot:')).map(i=><button key={i.key} className="saved-search" onClick={()=>download(`${i.key.slice(9)}-screening.json`,i.value,'application/json')}>Download {i.key.slice(9)} snapshot</button>)}</section><section className="panel padded notes-list"><h2>Your research notes</h2>{items.filter(i=>i.kind==='note'&&i.value).map(i=><Link className="saved-search" href={`/companies/${i.key}`} key={i.key}>{i.key}<ArrowRight size={14}/></Link>)}{!items.some(i=>i.kind==='note'&&i.value)&&<p className="muted">Open a company’s Research tab to add a browser-saved note.</p>}</section><div className="hint">Weights are editable preferences, not scientifically validated predictive parameters. AI assistance is unavailable in this version.</div></aside></div></>}
 {section==='sources'&&<>{heading('THE EVIDENCE TRAIL','Sources & provenance','Original records, retrieval dates, and preserved source history.')}<div className="trust-banner"><ShieldCheck size={18}/><span>{summary.claims} published claims linked to {summary.sources} original sources. {info('sources')} {info('claims')}</span></div><section className="panel"><div className="table-scroll"><table><thead><tr><th>Original source</th><th>Publisher</th><th>First retrieved</th><th>Last checked {info('freshness')}</th><th>Accessibility {info('freshness')}</th></tr></thead><tbody>{sources.map(s=><tr key={s.id}><td><a href={s.url} target="_blank" rel="noopener noreferrer" className="strong source-row-link">{s.title} <ExternalLink size={13}/></a><small>{s.url}</small></td><td>{s.publisher}</td><td>{date(s.retrieved_at)}</td><td>{date(s.last_checked)}</td><td>{hasDisplayValue(s.accessibility)?s.accessibility:null}</td></tr>)}</tbody></table></div></section></>}
 {section==='settings'&&<SettingsPage heading={heading} summary={summary} items={items} onItemsChange={next=>{setItems(next);selectWatchlist(watchlist,next);}}/>}
 {section==='learn'&&<VentureLearning/>}
  {section==='methodology'&&<>{heading('TRANSPARENCY BY DESIGN','Data methodology','Know what the evidence establishes—and what it does not.')}<Methodology/></>}
 <footer>Illinois Venture Radar <span>Independent startup discovery and research for Illinois-connected companies. No university endorsement.</span><Link href="/methodology">Methodology & limitations ↗</Link></footer></main></div>
 {toast&&<div role="status" className="toast"><Check size={16}/>{toast}</div>}</div>;
}
function Watchlists({heading,lists,watchlist,setWatchlist,newList,setNewList,onCreate,items,render,empty}:{
 heading:(a:string,b:string,c:string,d?:React.ReactNode)=>React.ReactNode;
 lists:string[];watchlist:string;setWatchlist:(v:string)=>void;
 newList:string;setNewList:(v:string)=>void;
 onCreate:(name:string)=>{ok:boolean;error?:string};
 items:Item[];render:(c:Company[])=>React.ReactNode;
 empty:(a:string,b:string)=>React.ReactNode;
}){
 const [rows,setRows]=useState<Company[]>([]);
 const [loading,setLoading]=useState(false);
 const [loadError,setLoadError]=useState('');
 const [createError,setCreateError]=useState('');
 const raw=items.find(i=>i.kind==='watchlist'&&i.key===watchlist)?.value||'[]';
 useEffect(()=>{
  let active=true;
  void Promise.resolve().then(async()=>{
   if(!active)return;
   setLoading(true);
   setLoadError('');
   setRows([]);
   try{
    const ids=watchlistCompanyIds(items,watchlist);
    const settled=await Promise.allSettled(ids.map(id=>request<Company|null>(`/api/data?view=company&id=${encodeURIComponent(id)}`)));
    if(!active)return;
    const found:Company[]=[];
    let unavailable=0;
    for(const result of settled){
     if(result.status==='fulfilled'&&result.value)found.push(result.value);
     else unavailable++;
    }
    setRows(found);
    if(unavailable)setLoadError(`${unavailable} saved ${unavailable===1?'company is':'companies are'} unavailable right now. Other saved companies are still shown.`);
   }catch(e){if(active)setLoadError(e instanceof Error?e.message:'Unable to load this watchlist');}
   finally{if(active)setLoading(false);}
  });
  return()=>{active=false;};
 },[watchlist,raw]);
 function submitNewList(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  const result=onCreate(newList);
  if(result.ok){setNewList('');setCreateError('');}
  else setCreateError(result.error||'Could not create the watchlist');
 }
 return <>{heading('YOUR RESEARCH PIPELINE','Watchlists','Keep promising companies close and return to the original sources.')}
  <div className="filters watchlist-tools">
   <label className="watchlist-select-label">Selected watchlist
    <select aria-label="Current watchlist" value={watchlist} onChange={e=>{setWatchlist(e.target.value);setCreateError('');}}>
     {lists.map(l=><option value={l} key={l}>{l}</option>)}
    </select>
   </label>
   <form className="watchlist-create-form" onSubmit={submitNewList}>
    <label htmlFor="watchlist-new-name">Create another watchlist</label>
    <div className="watchlist-create-controls">
     <input id="watchlist-new-name" aria-label="New watchlist name" value={newList} maxLength={80}
      onChange={e=>{setNewList(e.target.value);if(createError)setCreateError('');}}
      placeholder="e.g., Climate technology"/>
     <button type="submit"><Plus size={16}/>Create watchlist</button>
    </div>
   </form>
  </div>
  {createError&&<p className="watchlist-error" role="alert">{createError}</p>}
  <p className="watchlist-active-hint">Bookmarks elsewhere in the site will be saved to <strong>{watchlist}</strong>. Select another list here to change the destination.</p>
  <section className="panel">
   <div className="panel-heading"><h2>{watchlist} <span className="pill">{rows.length}</span></h2><Link href="/discover">Add companies <Plus size={15}/></Link></div>
   {loadError&&<p className="watchlist-error" role="alert">{loadError}</p>}
   {loading?<div className="loading" role="status">Loading watchlist…</div>:rows.length?render(rows):!loadError?empty('Build your research shortlist','Save companies from Companies using the bookmark icon.'):null}
  </section>
 </>;
}
function SettingsPage({heading,summary,items,onItemsChange}:{heading:(a:string,b:string,c:string,d?:React.ReactNode)=>React.ReactNode;summary:Summary;items:Item[];onItemsChange:(items:Item[])=>void}){
 const [status,setStatus]=useState('');
 function exportResearch(){
  try{const text=JSON.stringify(JSON.parse(encodeLocalWorkspace(items)),null,2);download('illinois-venture-radar-research.json',text,'application/json');setStatus('Research backup downloaded. Keep this file private.');}
  catch(e){setStatus(e instanceof Error?e.message:'Unable to export research');}
 }
 async function importResearch(file:File|undefined){
  if(!file)return;
  if(file.size>2000000){setStatus('Backup file is too large (2 MB limit).');return;}
  try{
   const imported=decodeLocalWorkspace(await file.text());
   window.localStorage.setItem(LOCAL_WORKSPACE_KEY,encodeLocalWorkspace(imported));
   onItemsChange(imported);
   setStatus('Imported '+imported.length+' browser research records. Existing browser research was replaced.');
  }catch(e){setStatus(e instanceof Error?e.message:'Unable to import the backup');}
 }
 function clearResearch(){
  if(!window.confirm('Remove all saved research from this browser? Export a backup first if you need it.'))return;
  try{
   window.localStorage.removeItem(LOCAL_WORKSPACE_KEY);
   window.localStorage.removeItem('ivr-active-watchlist');
   window.localStorage.removeItem('ivr-compare');
   onItemsChange([]);
   setStatus('Browser research cleared. Shared startup records in Supabase were not changed.');
  }catch(e){setStatus(e instanceof Error?e.message:'Could not clear browser research');}
 }
 return <>{heading('PUBLIC RESEARCH WORKSPACE','Settings','No login required. Research is saved on this browser, not in a Supabase investor account.')}
  <div className="profile-grid">
   <section className="panel padded">
    <h2>Browser-local research</h2>
    <p>Your watchlists, notes, founder contacts, saved searches, investment thesis and reports stay in this browser profile. They do not synchronize between devices and may be lost if browser data is cleared.</p>
    <p className="muted">Local storage is not encrypted or access-controlled per person. Do not save sensitive diligence on a shared or public computer.</p>
    <p><strong>{items.length}</strong> locally saved research records</p>
    <div className="stack">
     <button onClick={exportResearch}><Download size={16}/>Export research backup (JSON)</button>
     <label>Import a browser research backup <input type="file" accept=".json,application/json" aria-label="Import research backup" onChange={e=>{const file=e.target.files?.[0];e.target.value='';void importResearch(file);}}/></label>
     <button onClick={clearResearch}><X size={16}/>Clear saved browser research</button>
    </div>
    <p role="status">{status}</p>
   </section>
   <section className="panel padded">
    <h2>Source quality <MetricInfo metric="verification" lastChecked={summary.lastChecked}/></h2>
    <p>{summary.companies} sourced companies · {summary.claims} supported claims · {summary.conflicts} conflicting claims</p>
    <h2>Data refresh <MetricInfo metric="freshness" lastChecked={summary.lastChecked}/></h2>
    <p>Supabase PostgreSQL still stores shared, source-backed startup facts. Scheduled Vercel jobs refresh approved sources; new observations requiring review are not automatically published.</p>
    <p className="muted">Data imports, source review and scheduled-job authorization are managed separately. This public interface does not expose administrative controls.</p>
   </section>
  </div>
 </>;
}
