'use client';

import Script from 'next/script';
import {usePathname} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';
import {publicAnalyticsPath} from '@/core/analytics-policy.mjs';

declare global {
 interface Window {
  sa_pageview?: (path:string)=>void;
 }
}

/**
 * Only explicitly permitted route groups can trigger manual page views.
 * Disabling automatic collection prevents raw private URLs from leaking
 * when an override returns a falsy value.
 */
export default function EducationAnalytics(){
 const pathname=usePathname();
 const safePath=publicAnalyticsPath(pathname);
 const [ready,setReady]=useState(false);
 const lastSent=useRef<string|null>(null);

 useEffect(()=>{
  if(!ready||!safePath||typeof window.sa_pageview!=='function')return;
  if(lastSent.current===safePath)return;
  window.sa_pageview(safePath);
  lastSent.current=safePath;
 },[safePath,ready]);

 // Never load the analytics script for a direct private-route visit.
 // Scripts already loaded during SPA navigation can persist, so this
 // optional integration remains off until the privacy policy is reviewed.
 if(!safePath)return null;

 return <Script
  id="ivr-simple-analytics"
  src="https://scripts.simpleanalyticscdn.com/latest.js"
  strategy="afterInteractive"
  onReady={()=>setReady(true)}
  data-auto-collect="false"
  data-collect-dnt="false"
  data-ignore-metrics="referrer,utm,session,timeonpage,scrolled,useragent,screensize,viewportsize,language,querykeys"
  data-allow-params=""
  data-strict-utm="true"
 />;
}
