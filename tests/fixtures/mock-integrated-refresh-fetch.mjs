/* Simulated encrypted credential boundary: no real outbound network. */
const GOOD='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
globalThis.fetch=async(url,options={})=>{
 const target=new URL(String(url));
 if(target.hostname==='venture.example.org'&&target.pathname==='/api/admin/refresh'){
  const connector=JSON.parse(String(options.body||'{}')).connector;
  const token=String(process.env.IVR_ADMIN_TOKEN||'');
  if(options.method!=='POST'||options.redirect!=='error'||options.headers?.Authorization!=='Bearer '+token)
   throw Error('Unexpected refresh request');
  process.stdout.write('SOURCE_REQUEST '+connector+'\n');
  const mode=connector==='research-park-news'?process.env.IVR_TEST_RECEIPT_MODE:'good';
  if(mode==='http503')
   return new Response(JSON.stringify({error:'secret token='+token}),{status:503});
  if(mode==='nonjson')return new Response('<html>login</html>',{status:200});
  const payload={connector,jobId:GOOD,observed:3,imported:1,staged:1,deferred:0};
  switch(mode){
   case 'okFalse':payload.ok=false;break;
   case 'error':payload.error='secret token='+token;break;
   case 'wrongConnector':payload.connector='different-connector';break;
   case 'jobMissing':delete payload.jobId;break;
   case 'jobInvalid':payload.jobId='not-a-uuid';break;
   case 'negative':payload.staged=-1;break;
   case 'string':payload.imported='1';break;
   case 'float':payload.observed=2.5;break;
   case 'inconsistent':payload.imported=9;break;
   case 'statusFailed':payload.status='Failed';break;
   case 'array':return new Response(JSON.stringify([payload]));
   case 'null':return new Response('null');
  }
  return new Response(JSON.stringify(payload));
 }
 if(target.hostname==='api.honeybadger.io'&&target.pathname.startsWith('/v1/check_in/')){
  process.stdout.write('HEARTBEAT_SENT\n');
  return new Response('ok');
 }
 throw Error('Unexpected provider request');
};
