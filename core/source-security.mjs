/**
 * Shared validation for official-source URLs, public venture websites, dates.
 * Fail closed: unrecognized formats stay unknown or pending.
 */
export const SOURCE_PATHS=Object.freeze({
 'iventure-cohorts':{hosts:['iventure.illinois.edu'],paths:[/^\/startups\/?$/]},
 'otm-startups':{hosts:['otm.illinois.edu','www.otm.illinois.edu'],paths:[/^\/browse-technologies-startups\/startups\/?$/]},
 'enterpriseworks-directory':{hosts:['researchpark.illinois.edu'],paths:[/^\/category\/tenant-directory\/enterpriseworks-incubator\/(?:page\/[1-6]\/)?$/]},
 'research-park-news':{hosts:['researchpark.illinois.edu'],paths:[/^\/[a-z0-9][a-z0-9\/_-]*\/$/]},
 'illinois-news':{hosts:['entrepreneurship.illinois.edu','www.entrepreneurship.illinois.edu'],paths:[/^\/[a-z0-9][a-z0-9\/_.-]*\/?$/]},
 'nih-reporter':{hosts:['reporter.nih.gov'],paths:[/^\/project-details\/[0-9]+\/?$/]},
 'usaspending':{hosts:['www.usaspending.gov'],paths:[/^\/award\/[a-zA-Z0-9._-]+\/?$/]}
});
function parsedURL(value){
 if(typeof value!=='string'||value.trim()!==value)throw Error('Invalid source URL');
 let url;try{url=new URL(value);}catch{throw Error('Invalid source URL');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||url.origin==='null')
  throw Error('Noncanonical HTTPS source URL');
 return url;
}
export function officialSourceUrl(value,connector){
 const url=parsedURL(value),policy=SOURCE_PATHS[connector];
 if(!policy||!policy.hosts.includes(url.hostname)||!policy.paths.some(p=>p.test(url.pathname)))
  throw Error('Source outside connector allowlist');
 return url.href;
}
export function trustedOfficialProfile(value){
 const url=parsedURL(value);
 if(url.hostname!=='researchpark.illinois.edu'||!/^\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(url.pathname))
  throw Error('Invalid Research Park official profile');
 return url.href;
}
function isPrivateHost(h){
 const host=h.replace(/^\[|\]$/g,'').toLowerCase();
 if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
    host.endsWith('.internal')||host.endsWith('.onion')||host==='::1'||host==='0:0:0:0:0:0:0:1')return true;
 if(host.includes(':'))return true; // No IP literal addresses in company website identities.
 if(/^\d+\.\d+\.\d+\.\d+$/.test(host)){
  const parts=host.split('.').map(Number);
  return parts[0]===0||parts[0]===10||parts[0]===127||parts[0]===169&&parts[1]===254||
   parts[0]===172&&parts[1]>=16&&parts[1]<=31||parts[0]===192&&parts[1]===168||
   parts[0]===100&&parts[1]>=64&&parts[1]<=127||parts[0]>=224;
 }
 return !host.includes('.');
}
export function publicVentureWebsite(value){
 let url;try{url=parsedURL(value);}catch{throw Error('Untrusted company website');}
 if(isPrivateHost(url.hostname)||url.hostname.length>253||url.pathname.length>500)
  throw Error('Untrusted company website');
 return url.href;
}
/** Reject JavaScript Date's silent normalization of impossible calendar dates. */
export function publishedDate(input){
 if(typeof input!=='string'||!input.trim())return null;
 const raw=input.trim();
 let iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/);
 let y,m,d;
 if(iso){[,y,m,d]=iso;}
 else{
  const human=raw.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})$/i);
  if(!human)return null;
  const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  y=human[3];m=String(months.indexOf(human[1].toLowerCase())+1).padStart(2,'0');d=human[2].padStart(2,'0');
 }
 const date=new Date(Date.UTC(Number(y),Number(m)-1,Number(d)));
 if(date.getUTCFullYear()!==Number(y)||date.getUTCMonth()+1!==Number(m)||date.getUTCDate()!==Number(d))
  return null;
 if(iso&&raw.includes('T')&&Number.isNaN(Date.parse(raw)))return null;
 return [y,m,d].join('-');
}
