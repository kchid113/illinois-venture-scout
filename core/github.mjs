/** Explicit verified repository claim is mandatory; company-name search is deliberately unsupported. */
export async function githubReleases(repositoryClaim,fetcher=fetch){
 if(!repositoryClaim || repositoryClaim.status!=='Published' || !repositoryClaim.evidence?.length || repositoryClaim.field!=='repository')throw Error('A reviewed repository identity claim with evidence is required');
 const url=new URL(repositoryClaim.value);if(url.origin!=='https://github.com'||!/^\/[\w.-]+\/[\w.-]+\/?$/.test(url.pathname))throw Error('Invalid GitHub repository');
 const r=await fetcher(`https://api.github.com/repos${url.pathname.replace(/\/$/,'')}/releases?per_page=30`,{redirect:'error',headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'IllinoisVentureRadar'},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error(`GitHub HTTP ${r.status}; retry after ${r.headers.get('retry-after')||r.headers.get('x-ratelimit-reset')||'cooldown'}`);
 const body=await r.json();if(!Array.isArray(body))throw Error('Unexpected GitHub response');return body.filter(r=>!r.draft && r.published_at).map(r=>({id:String(r.id),name:r.name||r.tag_name,url:r.html_url,eventDate:r.published_at,category:'Engineering',description:`Repository release: ${r.name||r.tag_name}`}));
}
