import {publishedDate} from './source-security.mjs';

/** Canonical GitHub URLs are identities, not fuzzy company-name search results. */
function safeGithubUrl(value){
 if(typeof value!=='string'||value.trim()!==value)throw Error('Invalid GitHub URL');
 let u;try{u=new URL(value);}catch{throw Error('Invalid GitHub URL');}
 if(u.protocol!=='https:'||u.hostname!=='github.com'||u.username||u.password||u.port||u.search||u.hash||/%2f|%2e/i.test(value))
  throw Error('Invalid GitHub URL');
 return u;
}
export function repositoryIdentity(value){
 const u=safeGithubUrl(value);
 if(!/^\/[a-zA-Z0-9][\w.-]*\/[a-zA-Z0-9][\w.-]*\/?$/.test(u.pathname)||u.pathname.includes('..'))
  throw Error('Invalid GitHub repository');
 const parts=u.pathname.split('/').filter(Boolean);
 if(parts.some(v=>v==='.'||v==='..'||v.endsWith('.git')))throw Error('Invalid GitHub repository');
 return {owner:parts[0],repo:parts[1],path:'/'+parts.join('/'),url:u.href};
}
export function releaseIdentity(value){
 const u=safeGithubUrl(value),m=u.pathname.match(/^\/([a-zA-Z0-9][\w.-]*)\/([a-zA-Z0-9][\w.-]*)\/releases\/tag\/([^/]+)$/);
 if(!m||m[3]==='.'||m[3]==='..')throw Error('Invalid GitHub release source');
 return {owner:m[1],repo:m[2],tag:m[3],url:u.href};
}
export function eligibleRepositoryClaim(claim){
 return !!claim&&claim.field==='repository'&&claim.status==='Published'&&claim.classification==='Verified factual'&&
  Array.isArray(claim.evidence)&&claim.evidence.some(e=>e?.source_id&&e.relationship==='supports');
}
export function normalizeRelease(source,repository=null){
 if(!source||typeof source!=='object'||source.draft===true)return null;
 const id=String(source.id??'');
 if(!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id)))return null;
 const eventDate=publishedDate(source.published_at||source.eventDate);
 if(!eventDate)return null;
 let identity;try{identity=releaseIdentity(source.html_url||source.url);}catch{return null;}
 if(repository&&(identity.owner.toLowerCase()!==repository.owner.toLowerCase()||identity.repo.toLowerCase()!==repository.repo.toLowerCase()))
  return null;
 const name=String(source.name||source.tag_name||'').trim();
 if(!name||name.length>240)return null;
 return {id,name,url:identity.url,eventDate,category:'Engineering',description:'Repository release: '+name};
}
