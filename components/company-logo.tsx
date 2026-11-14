'use client';
import Image from 'next/image';
import {useState} from 'react';
import {companyLogoCandidates} from '@/core/company-logo-sources.mjs';

/**
 * Logos are selected by identity, never by loose company-name matching.
 *
 * The Research Park assets below are the company-specific lead image linked
 * directly from each named University of Illinois Research Park company profile.
 * When one is unavailable, a sourced company-website icon is tried instead.
 * An unverified/missing image always falls back to initials; in particular the
 * Research Park and iVenture mastheads must NOT masquerade as company logos.
 */
type CompanyWithIdentity={
 id:string;
 name:string;
 profile?:string;
 claims?:Array<{field:string;value:string;evidence?:Array<{relationship?:string}>}>;
};

const sizes={card:52,table:36,index:34,profile:74} as const;
export default function CompanyLogo({company,variant='card'}:{company:CompanyWithIdentity;variant?:keyof typeof sizes}){
 const [attempt,setAttempt]=useState(0);
 const images=companyLogoCandidates(company);
 const src=images[attempt];
 const initials=company.name.trim().split(/\s+/u).slice(0,2).map(word=>word[0]||'').join('').toUpperCase().slice(0,2)||'IV';
 const size=sizes[variant];
 return <span className={`company-logo company-logo--${variant} ${src?'company-logo--image':'company-logo--fallback'}`} title={src?'Logo or icon from an official company-linked source':undefined} aria-hidden="true">
   {src?<Image unoptimized src={src} width={size} height={size} className="company-logo__image" alt="" loading={variant==='profile'?'eager':'lazy'} onError={()=>setAttempt(i=>i+1)}/>:<span className="company-logo__initials">{initials}</span>}
 </span>;
}
