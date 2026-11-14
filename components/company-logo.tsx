'use client';
import Image from 'next/image';
import {useState} from 'react';

/**
 * Logos are selected by identity, never by loose company-name matching.
 *
 * The Research Park assets below are the company-specific lead image linked
 * directly from each named University of Illinois Research Park company profile.
 * When one is unavailable, a sourced company-website icon is tried instead.
 * An unverified/missing image always falls back to initials; in particular the
 * Research Park and iVenture mastheads must NOT masquerade as company logos.
 */
export const RESEARCH_PARK_MARKS:Record<string,string>={
 'aganswers-ai':'https://researchpark.illinois.edu/wp-content/uploads/2026/08/AgAnswers-AI.png',
 'ai-nexus-healthcare':'https://researchpark.illinois.edu/wp-content/uploads/2024/06/3x2-Logo-AI-Nexus-01.jpg',
 'amplified-hr':'https://researchpark.illinois.edu/wp-content/uploads/2024/06/3x2-Logo-Amplified-HR-01-1.jpg',
 'archean-sciences':'https://researchpark.illinois.edu/wp-content/uploads/2026/08/Archean-Sciences.png',
 'arist-ai':'https://researchpark.illinois.edu/wp-content/uploads/2025/08/Screenshot-2025-08-25-at-12.58.36-PM-1024x401.png',
 'bloomd':'https://researchpark.illinois.edu/wp-content/uploads/2024/06/3x2-Logo-bloomd-01.jpg',
 'boston-bioprocess':'https://researchpark.illinois.edu/wp-content/uploads/2024/06/3x2-Logo-Boston-Bio-01.jpg',
 'cache-energy':'https://researchpark.illinois.edu/wp-content/uploads/2024/06/f9fce257-5b0f-479c-98d3-45b9ee1fe346-e1655138167220.jpg',
 'cascade-dynamics':'https://researchpark.illinois.edu/wp-content/uploads/2026/08/Cascade-Dynamics.png',
 'cephalcorps':'https://researchpark.illinois.edu/wp-content/uploads/2026/08/Cephal-Corps.png',
 'cleanslate-robotics':'https://researchpark.illinois.edu/wp-content/uploads/2026/08/Cleanslate-Robotics.png',
 'cohesive-manufacturing':'https://researchpark.illinois.edu/wp-content/uploads/2024/06/3x2-Logo-Cohesive-Manufacturing-01.jpg',
 'cygnus':'https://researchpark.illinois.edu/wp-content/uploads/2024/06/Photonics-Cygnus-3x2-1.png',
 'dapup':'https://researchpark.illinois.edu/wp-content/uploads/2026/01/DapUp.png',
 'dark-matter-robotics':'https://researchpark.illinois.edu/wp-content/uploads/2026/01/Dark-Matter-Robotics.png',
 'epivara':'https://researchpark.illinois.edu/wp-content/uploads/2024/06/epivara-3x2-100.jpg',
 'erg-bio':'https://researchpark.illinois.edu/wp-content/uploads/2026/01/Erg-Bio.png',
 'forgebee':'https://researchpark.illinois.edu/wp-content/uploads/2024/06/ForgeBee-1.png',
 'frenzy-ag':'https://researchpark.illinois.edu/wp-content/uploads/2024/06/Untitled-presentation-1.png',
 'gigacrop':'https://researchpark.illinois.edu/wp-content/uploads/2025/08/gigacrop_logo.jpeg',
 'globi-social':'https://researchpark.illinois.edu/wp-content/uploads/2026/08/Globi-Social.png',
 'glucosentient':'https://researchpark.illinois.edu/wp-content/uploads/2024/06/3x2-Logo-GlucoSentient-01.png',
 'habiterre':'https://researchpark.illinois.edu/wp-content/uploads/2024/06/Habiterre_3x2-Logo-01.png',
 'hexaf-innovations':'https://researchpark.illinois.edu/wp-content/uploads/2026/08/HexaF-Innovations-1.png',
 'hinetics':'https://researchpark.illinois.edu/wp-content/uploads/2026/04/Hinetics.png',
 'hourglass-medical':'https://researchpark.illinois.edu/wp-content/uploads/2024/06/Hourglass_Logo_Horizontal-1.png'
};

// Explicitly avoid applying a directory's common favicon to its tenants, or
// representing a social network / unrelated domain as the startup itself.
const DIRECTORY_HOSTS=new Set([
 'researchpark.illinois.edu','www.researchpark.illinois.edu',
 'iventure.illinois.edu','otm.illinois.edu','illinois.edu','www.illinois.edu',
 'www.linkedin.com','linkedin.com','facebook.com','www.facebook.com',
 'instagram.com','www.instagram.com','gwb.com','www.gwb.com'
]);

type CompanyWithIdentity={
 id:string;
 name:string;
 profile?:string;
 claims?:Array<{field:string;value:string;evidence?:Array<{relationship?:string}>}>;
};

function trustedCompanyHost(raw?:string):string|null{
 if(!raw)return null;
 try{
  const u=new URL(raw);
  const host=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port||!host.includes('.')||DIRECTORY_HOSTS.has(host))return null;
  if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.localhost'))return null;
  if(/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.includes(':'))return null;
  return host;
 }catch{return null;}
}

export function companyLogoCandidates(company:CompanyWithIdentity):string[]{
 const candidates:string[]=[];
 try{
  const url=new URL(company.profile||'');
  if(url.hostname==='researchpark.illinois.edu'){
   const slug=url.pathname.split('/').filter(Boolean).join('/');
   if(RESEARCH_PARK_MARKS[slug])candidates.push(RESEARCH_PARK_MARKS[slug]);
  }
 }catch{/* No company-specific Research Park image. */}
 const verifiedWebsite=company.claims?.find(c=>c.field==='website' && c.evidence?.some(e=>e.relationship==='supports'))?.value;
 const host=trustedCompanyHost(verifiedWebsite)||trustedCompanyHost(company.profile);
 if(host){
  candidates.push('https://'+host+'/apple-touch-icon.png');
  candidates.push('https://'+host+'/favicon.ico');
 }
 return [...new Set(candidates)];
}

const sizes={card:52,table:36,index:34,profile:74} as const;
export default function CompanyLogo({company,variant='card'}:{company:CompanyWithIdentity;variant?:keyof typeof sizes}){
 const [attempt,setAttempt]=useState(0);
 const images=companyLogoCandidates(company);
 const src=images[attempt];
 const initials=company.name.trim().split(/\s+/u).slice(0,2).map(word=>word[0]||'').join('').toUpperCase().slice(0,2)||'IV';
 const size=sizes[variant];
 return <span className={`company-logo company-logo--${variant}`} title={src?'Logo or icon from an official company-linked source':undefined} aria-hidden="true">
   {src?<Image unoptimized src={src} width={size} height={size} className="company-logo__image" alt="" loading={variant==='profile'?'eager':'lazy'} onError={()=>setAttempt(i=>i+1)}/>:<span className="company-logo__initials">{initials}</span>}
 </span>;
}
