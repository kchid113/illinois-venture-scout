import {eligibleRepositoryClaim,repositoryIdentity,normalizeRelease} from './github-policy.mjs';

/** Explicit supporting factual repository evidence is mandatory; no name search. */
export async function githubReleases(repositoryClaim,fetcher=fetch){
 if(!eligibleRepositoryClaim(repositoryClaim))
  throw Error('A reviewed repository identity claim with supporting evidence is required');
 let identity;
 try{identity=repositoryIdentity(repositoryClaim.value);}
 catch{throw Error('Invalid GitHub repository');}
 const url='https://api.github.com/repos'+identity.path+'/releases?per_page=30';
 const response=await fetcher(url,{
  redirect:'error',
  headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'IllinoisVentureRadar'},
  signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error('GitHub HTTP '+response.status+'; retry after '+
  (response.headers.get('retry-after')||response.headers.get('x-ratelimit-reset')||'cooldown'));
 const raw=await response.text();
 if(raw.length>2_500_000)throw Error('GitHub response exceeds size limit');
 let body;try{body=JSON.parse(raw);}catch{throw Error('Unexpected GitHub response');}
 if(!Array.isArray(body))throw Error('Unexpected GitHub response');
 const found=new Map();
 for(const entry of body.slice(0,30)){
  const release=normalizeRelease(entry,identity);
  if(release&&!found.has(release.id))found.set(release.id,release);
 }
 return [...found.values()];
}
