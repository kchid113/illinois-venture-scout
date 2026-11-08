/**
 * Production-only Vercel cron policy. Each listed connector has a distinct
 * literal path and no more than one invocation per day (Hobby compatible).
 * Never schedule OTM: robots restrictions require manual source review.
 *
 * UTC schedules are staggered to avoid rate-limit bursts and overlaps.
 */
export const SOURCE_SCHEDULE=Object.freeze([
 {connector:'research-park-1', schedule:'5 7 * * 1',category:'directory'},
 {connector:'research-park-2', schedule:'5 7 * * 2',category:'directory'},
 {connector:'research-park-3', schedule:'5 7 * * 3',category:'directory'},
 {connector:'research-park-4', schedule:'5 7 * * 4',category:'directory'},
 {connector:'research-park-5', schedule:'5 7 * * 5',category:'directory'},
 {connector:'enterpriseworks-directory',schedule:'25 9 * * 2',category:'directory'},
 {connector:'iventure-cohorts',schedule:'25 9 * * 6',category:'directory'},
 {connector:'research-park-news',schedule:'10 12 * * *',category:'news'},
 {connector:'illinois-news',schedule:'10 13 * * *',category:'news'},
 {connector:'nih-reporter',schedule:'30 15 * * 2',category:'award'},
 {connector:'usaspending',schedule:'30 15 * * 4',category:'award'},
 {connector:'github-releases',schedule:'10 16 * * *',category:'engineering'}
].map(x=>Object.freeze(x)));
export const SCHEDULED_CONNECTORS=Object.freeze(SOURCE_SCHEDULE.map(x=>x.connector));
export const CRON_PATH_PREFIX='/api/cron/refresh/';
export const cronPath=connector=>CRON_PATH_PREFIX+connector;
export function isScheduledConnector(value){
 return typeof value==='string'&&SCHEDULED_CONNECTORS.includes(value);
}
/** 429/403 and robots restrictions must not trigger aggressive retry traffic. */
export function retryableFailure(error){
 const message=String(error instanceof Error?error.message:error);
 return /(?:Source HTTP 50[0234]|GitHub HTTP 50[0234]|fetch failed|network error|socket hang up|AbortError|TimeoutError|timed out)/i.test(message);
}
/**
 * Retry the complete idempotent source job only for bounded transport/5xx errors.
 * @param {string} connector
 * @param {{db?:any, refresh?:(db:any,source:string)=>Promise<any>,
 *          wait?:(milliseconds:number)=>Promise<void>,maxAttempts?:number}} [options]
 */
export async function executeScheduledConnector(connector,{
 refresh,db,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
 maxAttempts=3
}={}){
 if(!isScheduledConnector(connector))throw Error('Connector not scheduled for automatic collection');
 if(typeof refresh!=='function'||!db)throw Error('Scheduled refresh dependencies missing');
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>3)throw Error('Invalid retry budget');
 for(let attempt=1;attempt<=maxAttempts;attempt++){
  try{
   const result=await refresh(db,connector);
   if(!result||result.connector!==connector||!result.jobId)
    throw Error('Refresh returned an invalid persisted job receipt');
   return {...result,attempt};
  }catch(error){
   if(attempt>=maxAttempts||!retryableFailure(error))throw error;
   await wait(1500*attempt);
  }
 }
 throw Error('Scheduled retry exhausted');
}
