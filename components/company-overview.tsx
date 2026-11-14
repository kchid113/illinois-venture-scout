'use client';
import {useState} from 'react';
import {ArrowRight,ArrowUpRight,Check,ClipboardList,ExternalLink,Mail,ShieldCheck,UserRound} from 'lucide-react';
import {founderOutreach,parsePrivateContact,validatePrivateContact} from '@/core/founder-outreach.mjs';

type Evidence={id:string;source_id:string;relationship?:string;url:string;publisher:string;title:string;published_at:string|null;retrieved_at:string;last_checked:string;accessibility:string;excerpt:string};
type Claim={id:string;field:string;value:string;status:string;classification:string;evidence:Evidence[]};
type Company={id:string;name:string;profile?:string;updated_at:string;claims:Claim[];signals?:{id:string;description:string;event_date:string|null}[]};
type Props={company:Company;citation:(c?:Claim)=>React.ReactNode;onSources:()=>void;onSignals:()=>void;onFounderContact:()=>void};
const fields=(c:Company,names:string[])=>c.claims.filter(c=>names.includes(c.field.toLowerCase())&&c.evidence.some(e=>e.source_id&&e.relationship==='supports'));
const primary=(c:Company,names:string[])=>fields(c,names)[0];
const formatDate=(v?:string|null)=>v?new Date(v).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'Not recorded';

function SourcedFact({company,label,names,citation}:{company:Company;label:string;names:string[];citation:Props['citation']}){
 const matching=fields(company,names);
 if(!matching.length)return null;
 return <div className="deep-fact"><span className="deep-fact-label">{label}</span>
  {matching.map(c=><div className="deep-fact-entry" key={c.id}>
   <strong>{c.value}</strong> {citation(c)}
   <small>{c.status==='Conflicting'?'Conflicting evidence':c.classification}</small>
  </div>)}
 </div>;
}

export function CompanyContact({company,privateValue,onSave,citation}:{company:Company;privateValue?:string;onSave:(value:string)=>Promise<boolean>;citation:Props['citation']}){
 const found=founderOutreach(company);
 const empty={name:'',email:'',profile:'',notes:''};
 const [draft,setDraft]=useState(empty);
 const [editing,setEditing]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const privateRecord=parsePrivateContact(privateValue);
 const toggleEdit=()=>{
  if(!editing){setDraft(privateRecord||empty);setError('');}
  setEditing(!editing);
 };
 async function persist(){
  setError('');setSaving(true);
  try{
   const data=validatePrivateContact(draft);
   const ok=await onSave(JSON.stringify(data));
   if(ok)setEditing(false);
   else setError('Unable to save this private contact. Try again.');
  }catch(e){setError(e instanceof Error?e.message:'Invalid contact details');}
  finally{setSaving(false);}
 }
 return <section id="founder-contact" className="panel padded founder-contact-panel" aria-labelledby="founder-contact-title">
  <div className="outreach-heading"><div className="eyebrow"><UserRound size={14}/> FOUNDER ACCESS</div>
   <h2 id="founder-contact-title">Connect with the team</h2>
   <p>Use verified founder details when available, or start with the company’s documented public presence.</p>
  </div>
  {found.founders.length>0?<div className="founder-names">{found.founders.map((f:{value:string;claimId:string})=><div key={f.claimId}>
   <strong>{f.value}</strong> {citation(company.claims.find(x=>x.id===f.claimId))}
  </div>)}</div>:<p className="contact-unverified">Founder details are not included in the published research sources.</p>}
  <div className="contact-action-stack">
   {found.direct.map((link:{kind:string;label:string;url:string;value:string;claimId:string})=>
    <a className="button contact-direct" href={link.url} key={link.url}
     {...(link.kind==='profile'?{target:'_blank',rel:'noopener noreferrer'}:{})}>
     {link.kind==='email'?<Mail size={16}/>:<ExternalLink size={16}/>}
     {link.label} <ArrowUpRight size={15}/>
    </a>)}
   {found.website&&<a className="button" href={found.website} target="_blank" rel="noopener noreferrer">
    <ExternalLink size={16}/> Visit company website <ArrowUpRight size={14}/>
   </a>}
   {found.officialProfile&&<a className="button" href={found.officialProfile} target="_blank" rel="noopener noreferrer">
    <ExternalLink size={16}/> {found.website?'Official company listing':'Open company profile'} <ArrowUpRight size={14}/>
   </a>}
   {!found.direct.length&&<p className="contact-unverified">Founder introductions are not established by the available evidence. Use the official listing above as a research starting point.</p>}
  </div>
  <div className="private-contact">
   <div className="row private-contact-header">
    <div><h3>Your private contact book</h3><small>Saved only in your research workspace. Analyst-entered, not a public claim.</small></div>
    <button onClick={toggleEdit}>{editing?'Close':'Add / edit contact'}</button>
   </div>
   {privateRecord&&!editing&&<div className="private-contact-summary">
    {privateRecord.name&&<strong>{privateRecord.name}</strong>}
    {privateRecord.email&&<a href={'mailto:'+privateRecord.email}><Mail size={14}/> {privateRecord.email}</a>}
    {privateRecord.profile&&<a href={privateRecord.profile} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/> Saved contact profile</a>}
    {privateRecord.notes&&<p>{privateRecord.notes}</p>}
   </div>}
   {editing&&<div className="private-contact-form">
    <label>Contact name<input value={draft.name} maxLength={100} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="Founder or team contact"/></label>
    <label>Email (if known)<input type="email" value={draft.email} maxLength={254} onChange={e=>setDraft({...draft,email:e.target.value})} placeholder="name@company.com"/></label>
    <label>Profile link<input type="url" value={draft.profile} maxLength={500} onChange={e=>setDraft({...draft,profile:e.target.value})} placeholder="https://..."/></label>
    <label>Introduction context<textarea value={draft.notes} maxLength={750} rows={2} onChange={e=>setDraft({...draft,notes:e.target.value})} placeholder="Where you met, warm intro, or outreach status"/></label>
    {error&&<p role="alert" className="error">{error}</p>}
    <button className="primary" disabled={saving} onClick={()=>void persist()}><Check size={15}/>{saving?'Saving…':'Save private contact'}</button>
   </div>}
  </div>
 </section>;
}

export default function CompanyOverview({company,citation,onSources,onSignals,onFounderContact}:Props){
 const description=primary(company,['description']),technology=primary(company,['technology','product']);
 const sourced=company.claims.filter(c=>c.evidence.some(e=>e.source_id&&e.relationship==='supports'));
 const uniqueSources=new Map<string,{title:string;publisher:string;url:string;last_checked?:string}>();
 for(const claim of sourced)for(const e of claim.evidence){
  if(e.source_id&&e.relationship==='supports'&&!uniqueSources.has(e.source_id))
   uniqueSources.set(e.source_id,{title:e.title,publisher:e.publisher,url:e.url,last_checked:e.last_checked});
 }
 const missing=[
  {label:'Founder identity and contact',ok:fields(company,['founder','founders','co-founder','leadership']).length>0},
  {label:'Commercial traction and customers',ok:fields(company,['customers','customer','commercial traction','revenue']).length>0},
  {label:'Funding round and capitalization',ok:fields(company,['equity funding','funding round','equity financing']).length>0},
  {label:'Market and competitive position',ok:fields(company,['market','market size','competitors']).length>0}
 ];
 return <div className="company-overview">
  <div className="overview-intro-grid">
   <section className="panel padded company-story">
    <div className="eyebrow">COMPANY BRIEF</div><h2>What {company.name} is building</h2>
    {description?<><p className="company-story-text">{description.value} {citation(description)}</p>
     <span className="tag amber">Company-reported overview · linked to the source</span></>:
     <div className="company-story-unlisted"><p>The available university listing does not describe the product in detail.</p>{company.profile&&<a className="button research-source-cta" href={company.profile} target="_blank" rel="noopener noreferrer">Explore the original company listing <ArrowUpRight size={15}/></a>}</div>}
    {technology&&<div className="technology-note"><strong>Technology</strong><p>{technology.value} {citation(technology)}</p></div>}
    <div className="company-key-facts">
     <SourcedFact company={company} label="Sector" names={['sector']} citation={citation}/>
     <SourcedFact company={company} label="University ecosystem link" names={['affiliation','incubator','accelerator','university ip startup']} citation={citation}/>
     <SourcedFact company={company} label="Company stage" names={['stage']} citation={citation}/>
    </div>
   </section>
   <section className="panel padded founder-contact-teaser">
    <div className="eyebrow"><UserRound size={14}/> TEAM & OUTREACH</div>
    <h2>Connect with the people building {company.name}</h2>
    <p>Open the dedicated contact view for source-backed founder details, official company links, and your private contact notes.</p>
    <button type="button" className="button primary" onClick={onFounderContact}>View founder & team contact <ArrowRight size={16}/></button>
   </section>
  </div>
  <div className="company-detail-grid">
   <section className="panel padded deep-section">
    <div className="eyebrow">BUSINESS & MARKET</div><h2>Product and commercialization</h2>
    <SourcedFact company={company} label="Product / technology" names={['technology','product']} citation={citation}/>
    <SourcedFact company={company} label="Business model" names={['business model']} citation={citation}/>
    <SourcedFact company={company} label="Customer and market evidence" names={['customer','customers','market','commercial traction']} citation={citation}/>
   </section>
   <section className="panel padded deep-section">
    <div className="eyebrow">PEOPLE & ORIGINS</div><h2>Team and university connection</h2>
    <SourcedFact company={company} label="Founders / leadership" names={['founder','founders','co-founder','leadership']} citation={citation}/>
    <SourcedFact company={company} label="Incubator and accelerator" names={['incubator','accelerator']} citation={citation}/>
    <SourcedFact company={company} label="University relationship" names={['affiliation','university ip startup']} citation={citation}/>
   </section>
   <section className="panel padded deep-section">
    <div className="eyebrow">CAPITAL & MOMENTUM</div><h2>Funding, traction and status</h2>
    <SourcedFact company={company} label="Equity financing" names={['equity funding','equity financing','funding round']} citation={citation}/>
    <SourcedFact company={company} label="Grants / awards" names={['grant','grants','government award','research award','federal award','government contract']} citation={citation}/>
    <SourcedFact company={company} label="Revenue / customer traction" names={['revenue','sales','customers','commercial traction']} citation={citation}/>
    <SourcedFact company={company} label="Operating status" names={['lifecycle','operating status','status']} citation={citation}/>
    <p className="fact-note">No funding or traction claims are currently published unless they appear above. A program listing alone does not establish investment, ownership, customers, or operations.</p>
   </section>
   <section className="panel padded deep-section evidence-summary">
    <div className="eyebrow"><ShieldCheck size={14}/> ORIGINAL EVIDENCE</div><h2>Source-backed research</h2>
    <div className="source-summary-number">{sourced.length}<span>supported or conflicting claims</span></div>
    {[...uniqueSources.values()].slice(0,5).map(s=><a className="evidence-summary-link" href={s.url} target="_blank" rel="noopener noreferrer" key={s.url}>
     <span><strong>{s.publisher}</strong><small>{s.title} · Checked {formatDate(s.last_checked)}</small></span><ArrowUpRight size={15}/>
    </a>)}
    <button className="button full" onClick={onSources}>Review all sources & claims <ArrowRight size={16}/></button>
   </section>
  </div>
  <div className="company-footer-grid">
   <section className="panel padded">
    <div className="eyebrow"><ClipboardList size={14}/> INVESTMENT DILIGENCE</div><h2>Questions to resolve</h2>
    <p className="muted">These questions highlight evidence gaps, not red flags or predictive scores.</p>
    <ul className="diligence-gaps">{missing.map(x=><li key={x.label}><span className={x.ok?'gap-dot resolved':'gap-dot'}/><span>{x.label}</span><small>{x.ok?'Evidence available':'To investigate'}</small></li>)}</ul>
   </section>
   <section className="panel padded next-steps">
    <div className="eyebrow">NEXT STEPS</div><h2>Continue your research</h2>
    <p>Inspect individual claims, review documented developments, and save your own founder conversation notes.</p>
    <button className="button full" onClick={onSignals}>View company activity <ArrowRight size={16}/></button>
    <button className="button full" onClick={onSources}>Open original evidence <ArrowRight size={16}/></button>
   </section>
  </div>
 </div>;
}
