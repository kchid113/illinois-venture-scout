/**
 * GitHub Student Developer Pack: Honeybadger cron check-ins.
 *
 * A check-in URL is a bearer credential. Never log it, place it in a URL
 * query string, or send it to any host other than Honeybadger's API.
 */
export function honeybadgerCheckinUrl(value){
 if(typeof value!=='string'||!value)throw Error('Honeybadger check-in URL is not configured');
 let url;try{url=new URL(value);}catch{throw Error('Invalid Honeybadger check-in URL');}
 if(url.protocol!=='https:'||
    !['api.honeybadger.io','eu-api.honeybadger.io'].includes(url.hostname)||
    url.username||url.password||url.port||url.search||url.hash||
    !/^\/v1\/check_in\/[a-zA-Z0-9_-]{4,200}(?:\/[a-zA-Z0-9_-]{1,100})?$/.test(url.pathname))
  throw Error('Invalid Honeybadger check-in destination');
 return url.href;
}
/**
 * Only call after a complete, successful scheduled refresh.
 * Avoid payloads: company names, user identities, connector results and
 * private research notes must never reach monitoring.
 */
export async function reportHoneybadgerSuccess(value,{fetcher=fetch}={}){
 if(!value)return {configured:false,reported:false};
 const url=honeybadgerCheckinUrl(value);
 let response;
 try{
  response=await fetcher(url,{
   method:'GET',redirect:'error',cache:'no-store',
   signal:AbortSignal.timeout(10000)
  });
 }catch{throw Error('Honeybadger check-in request failed');}
 if(!response.ok)throw Error('Honeybadger check-in rejected (HTTP '+response.status+')');
 return {configured:true,reported:true};
}
