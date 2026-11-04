import handler from 'vinext/server/fetch-handler';
import {verifyCloudflareAccess,identityRequest} from '../core/cloudflare-access.mjs';

/**
 * Standalone Cloudflare entrypoint; deliberately separate from the managed
 * Sites entrypoint so the existing deployment is not changed.
 *
 * Every application request including /api/* requires a signed Access JWT.
 * No client-supplied legacy Sites identity header can bypass the gate.
 */
const worker={
 async fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext){
  let identity;
  try{identity=await verifyCloudflareAccess(request,env);}
  catch{return new Response('Cloudflare Access authentication is required.',{
   status:403,headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'}
  });}
  if(!env.DB)return new Response('Database binding is not configured.',{
   status:503,headers:{'Cache-Control':'no-store'}
  });

  const pathname=new URL(request.url).pathname;
  if(pathname==='/signout-with-chatgpt')
   return Response.redirect(new URL('/cdn-cgi/access/logout',request.url).href,302);
  if(pathname==='/signin-with-chatgpt')
   return Response.redirect(new URL('/',request.url).href,302);
  if(pathname==='/callback')
   return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});

  const verified=identityRequest(request,identity);
  const response=await handler.fetch(verified,env,ctx);
  const headers=new Headers(response.headers);
  headers.set('Cache-Control','private, no-store');
  return new Response(response.body,{
   status:response.status,statusText:response.statusText,headers
  });
 }
};
export default worker;
