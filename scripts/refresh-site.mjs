/**
 * GitHub Actions scheduler: invokes the deployed application's protected refresh API.
 * No secrets or live data are written to the Git repository.
 */
const enabled=process.env.IVR_AUTOMATION_ENABLED==='true';
if(!enabled){
 console.log('Public-source refresh disabled. Set repository variable IVR_AUTOMATION_ENABLED=true after deployment and secret configuration.');
 process.exit(0);
}
const site=process.env.IVR_SITE_URL,token=process.env.IVR_ADMIN_TOKEN,serviceToken=process.env.IVR_SITES_SERVICE_TOKEN;
if(!site||!token||token.length<32)throw Error('IVR_SITE_URL and a >=32-character IVR_ADMIN_TOKEN are required');
const base=new URL(site);
if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||(base.pathname!=='/'&&base.pathname!==''))
 throw Error('IVR_SITE_URL must be a clean HTTPS origin');
const manual=process.env.IVR_CONNECTOR||'scheduled';
const all=['research-park-news','illinois-news','research-park-1','research-park-2','research-park-3','otm-startups','nih-reporter','usaspending','github-releases'];
const scheduled=new Date().getUTCDay()===1?all:['research-park-news','illinois-news'];
const targets=manual==='scheduled'?scheduled:manual==='all'?all:[manual];
if(targets.some(c=>!all.includes(c)))throw Error('Unrecognized scheduled connector');
let failed=0;
for(const connector of targets){
 try{
  const headers={'Authorization':`Bearer ${token}`,'Content-Type':'application/json','Accept':'application/json'};
  if(serviceToken)headers['OAI-Sites-Authorization']=serviceToken;
  const response=await fetch(new URL('/api/admin/refresh',base),{
   method:'POST',headers,redirect:'error',signal:AbortSignal.timeout(115000),body:JSON.stringify({connector})
  });
  const result=await response.json().catch(()=>({error:'non-JSON response (site authentication may be blocking requests)'}));
  if(!response.ok)throw Error(`HTTP ${response.status}: ${String(result.error||'refresh rejected').slice(0,250)}`);
  console.log(`${connector}: observed=${result.observed} imported=${result.imported} staged=${result.staged} deferred=${result.deferred}`);
 }catch(error){failed++;console.error(`${connector}: ${error instanceof Error?error.message:'failed'}`);}
}
if(failed)throw Error(`${failed}/${targets.length} refresh connector(s) failed. Inspect the application's ingestion_jobs and GitHub Actions logs.`);
