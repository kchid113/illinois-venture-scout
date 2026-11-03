import {CONNECTORS} from './source-candidates.mjs';
import {publicVentureWebsite} from './source-security.mjs';

/** Central source schedule policy, independent of GitHub Actions and HTTP. */
export const SOURCE_REFRESH_ORDER=Object.freeze([
 'research-park-news','illinois-news','iventure-cohorts','enterpriseworks-directory',
 'research-park-1','research-park-2','research-park-3','otm-startups',
 'nih-reporter','usaspending','github-releases'
]);
if(!SOURCE_REFRESH_ORDER.every(x=>CONNECTORS.includes(x))||SOURCE_REFRESH_ORDER.length!==CONNECTORS.length)
 throw Error('Scheduler source registry has drifted from permitted connectors');
export function refreshTargets(request='scheduled',dayUTC=new Date().getUTCDay()){
 if(!Number.isInteger(dayUTC)||dayUTC<0||dayUTC>6)throw Error('Invalid UTC weekday');
 if(request==='all')return [...SOURCE_REFRESH_ORDER];
 if(request==='scheduled')return dayUTC===1?[...SOURCE_REFRESH_ORDER]:['research-park-news','illinois-news'];
 if(SOURCE_REFRESH_ORDER.includes(request))return [request];
 throw Error('Unrecognized scheduled connector');
}
/** No secrets in this returned object or in error messages. */
export function refreshConfiguration(env){
 const token=env.IVR_ADMIN_TOKEN;
 if(typeof token!=='string'||token.length<32)throw Error('A 32+ character IVR_ADMIN_TOKEN is required');
 const value=env.IVR_SITE_URL;
 let url;
 try{url=new URL(publicVentureWebsite(value));}catch{throw Error('IVR_SITE_URL must be a public HTTPS site origin');}
 if(url.pathname!=='/'||url.search||url.hash||url.username||url.password||url.port)
  throw Error('IVR_SITE_URL must be a clean HTTPS origin with no path or port');
 return {base:url.href,token,serviceToken:env.IVR_SITES_SERVICE_TOKEN||null};
}
