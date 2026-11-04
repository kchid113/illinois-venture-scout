/**
 * Idempotent provision-only D1 bootstrap for a new standalone deployment.
 * Called only from an explicit, default-branch GitHub Actions dispatch.
 * Never deletes a database or silently attaches a different named database.
 * The API token is never emitted in logs or written to generated files.
 */
const DB_NAME='illinois-venture-radar';
const ACCOUNT=/^[a-f0-9]{32}$/i;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const BASE='https://api.cloudflare.com/client/v4';
const safeError=()=>Error('Cloudflare D1 account authorization or provisioning failed');
async function requestApi(accountId,token,path,{method='GET',data,fetcher=fetch}={}){
 let response;
 try{
  response=await fetcher(BASE+'/accounts/'+accountId+'/d1/database'+path,{
   method,redirect:'error',
   headers:{Authorization:'Bearer '+token,Accept:'application/json',
    ...(data?{'Content-Type':'application/json'}:{})},
   ...(data?{body:JSON.stringify(data)}:{}),
   signal:AbortSignal.timeout(15000)
  });
 }catch{throw safeError();}
 if(!response?.ok)throw safeError();
 let body;
 try{body=await response.json();}catch{throw safeError();}
 if(!body||body.success!==true)throw safeError();
 return body;
}
export async function provisionD1({accountId,token,allowCreate=false,fetcher=fetch}){
 if(typeof accountId!=='string'||!ACCOUNT.test(accountId)||
    typeof token!=='string'||token.length<20)throw safeError();
 const found=await requestApi(accountId,token,'?name='+DB_NAME+'&per_page=100',{fetcher});
 if(!Array.isArray(found.result))throw safeError();
 const matches=found.result.filter(x=>x?.name===DB_NAME);
 if(matches.length>1)throw Error('Ambiguous Cloudflare D1 name; select database manually');
 let db=matches[0];
 if(!db){
  if(!allowCreate)throw Error('Cloudflare D1 database not found; enable explicit creation');
  const result=await requestApi(accountId,token,'',{method:'POST',data:{name:DB_NAME},fetcher});
  db=result.result;
 }
 if(!db||db.name!==DB_NAME||typeof db.uuid!=='string'||!UUID.test(db.uuid))
  throw safeError();
 return {databaseId:db.uuid,created:!matches.length};
}
