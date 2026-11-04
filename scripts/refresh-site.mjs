import {refreshTargets,refreshConfiguration} from '../core/refresh-schedule.mjs';
import {reportHoneybadgerSuccess} from '../core/education-monitoring.mjs';
import {validateRefreshResponse,refreshHttpError} from '../core/refresh-contract.mjs';
/**
 * GitHub Actions scheduler: invokes the deployed application's protected refresh API.
 * No secrets or live data are written to the Git repository.
 */
const enabled=process.env.IVR_AUTOMATION_ENABLED==='true';
if(!enabled){
 console.log('Public-source refresh disabled. Set repository variable IVR_AUTOMATION_ENABLED=true after deployment and secret configuration.');
 process.exit(0);
}
const {base,token,serviceToken}=refreshConfiguration(process.env);
const targets=refreshTargets(process.env.IVR_CONNECTOR||'scheduled');
let failed=0;
for(const connector of targets){
 try{
  const headers={'Authorization':`Bearer ${token}`,'Content-Type':'application/json','Accept':'application/json'};
  if(serviceToken)headers['OAI-Sites-Authorization']=serviceToken;
  const response=await fetch(new URL('/api/admin/refresh',base),{
   method:'POST',headers,redirect:'error',signal:AbortSignal.timeout(115000),body:JSON.stringify({connector})
  });
  if(!response.ok)throw refreshHttpError(response.status);
  // Even an HTTP 200 can be a proxy login page or a JSON error.
  const payload=await response.json().catch(()=>null);
  const result=validateRefreshResponse(connector,payload);
  console.log(`${connector}: observed=${result.observed} imported=${result.imported} staged=${result.staged} deferred=${result.deferred}`);
 }catch(error){failed++;console.error(`${connector}: ${error instanceof Error?error.message:'failed'}`);}
}
if(failed)throw Error(`${failed}/${targets.length} refresh connector(s) failed. Inspect the application's ingestion_jobs and GitHub Actions logs.`);
/*
 * A manual successful run must NOT suppress an alert for a missing scheduled
 * run. Send exactly one heartbeat after the complete scheduled run succeeds.
 */
if((process.env.IVR_CONNECTOR||'scheduled')==='scheduled'&&process.env.IVR_HONEYBADGER_CHECKIN_URL){
 await reportHoneybadgerSuccess(process.env.IVR_HONEYBADGER_CHECKIN_URL);
 console.log('Scheduled refresh heartbeat acknowledged');
}

