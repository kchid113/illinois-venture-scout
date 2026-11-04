/**
 * Cloudflare Access JWT verification for independently hosted Workers.
 *
 * Do not trust oai-authenticated-user-* or Cf-Access-Jwt-Assertion merely
 * because a client sent it. Every request must pass RS256 signature, JWKS,
 * issuer, audience, expiry and non-service-user checks before creating an
 * application identity. This works even when Static Assets' router does not
 * forward ctx.access to the user Worker.
 *
 * Signing key cache is bounded and refreshed every 5 minutes; Access
 * rotates signing keys. This module contains no secrets.
 */
const TEAM=/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/;
const AUD=/^[A-Za-z0-9_-]{12,160}$/;
const KID=/^[A-Za-z0-9_\-+.=/]{1,256}$/;
const MAX_TOKEN=12000;
const TTL=5*60*1000;
const jwksCache=new Map();
export class CloudflareAccessError extends Error{
 constructor(){super('Cloudflare Access authentication required');this.name='CloudflareAccessError';}
}
const denied=()=>new CloudflareAccessError();
const fromB64=value=>{
 if(typeof value!=='string'||!value||!/^[a-zA-Z0-9_-]+$/.test(value)||value.length>10000)throw denied();
 try{return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
 catch{throw denied();}
};
function parsePart(value){
 const bytes=fromB64(value);
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch{throw denied();}
}
function config(env){
 const origin=String(env?.IVR_ACCESS_TEAM_DOMAIN||'');
 const audience=env?.IVR_ACCESS_AUD;
 if(!TEAM.test(origin)||typeof audience!=='string'||!AUD.test(audience))throw denied();
 return {origin,audience};
}
async function getKeys(origin,{fetcher=fetch,clock=Date.now,cache=jwksCache}={}){
 const cached=cache.get(origin);
 if(cached&&cached.expires>clock())return cached.keys;
 let response;
 try{
  response=await fetcher(origin+'/cdn-cgi/access/certs',{
   method:'GET',redirect:'error',headers:{Accept:'application/json'},
   signal:AbortSignal.timeout(10000)
  });
 }catch{throw denied();}
 if(!response?.ok)throw denied();
 let body;
 try{body=await response.json();}catch{throw denied();}
 if(!body||!Array.isArray(body.keys)||body.keys.length<1||body.keys.length>16)throw denied();
 const keys=body.keys.filter(x=>x&&typeof x==='object'&&x.kty==='RSA'&&typeof x.kid==='string'&&KID.test(x.kid)&&typeof x.n==='string'&&typeof x.e==='string'&&x.n.length<1000&&x.e.length<30);
 if(!keys.length)throw denied();
 cache.set(origin,{keys,expires:clock()+TTL});
 return keys;
}
export async function verifyCloudflareAccess(request,env,opts={}){
 const {origin,audience}=config(env);
 const token=request?.headers?.get('cf-access-jwt-assertion');
 if(typeof token!=='string'||token.length>MAX_TOKEN)throw denied();
 const pieces=token.split('.');
 if(pieces.length!==3)throw denied();
 const header=parsePart(pieces[0]),payload=parsePart(pieces[1]);
 if(!header||header.alg!=='RS256'||typeof header.kid!=='string'||!KID.test(header.kid)||!payload||typeof payload!=='object'||Array.isArray(payload))throw denied();
 const now=Math.floor((opts.clock||Date.now)()/1000);
 if(payload.iss!==origin||
    !(Array.isArray(payload.aud)?payload.aud.includes(audience):payload.aud===audience)||
    typeof payload.exp!=='number'||!Number.isSafeInteger(payload.exp)||payload.exp<=now||
    typeof payload.iat!=='number'||!Number.isSafeInteger(payload.iat)||payload.iat>now+60||
    payload.nbf!=null&&(typeof payload.nbf!=='number'||payload.nbf>now+60)||
    typeof payload.sub!=='string'||payload.sub.length<2||payload.sub.length>200||
    typeof payload.email!=='string'||payload.email.length>254||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)||
    payload.common_name!=null)throw denied();
 const keys=await getKeys(origin,opts);
 const key=keys.find(x=>x.kid===header.kid);
 if(!key)throw denied();
 let valid=false;
 try{
  const imported=await crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  valid=await crypto.subtle.verify({name:'RSASSA-PKCS1-v1_5'},imported,fromB64(pieces[2]),new TextEncoder().encode(pieces[0]+'.'+pieces[1]));
 }catch{throw denied();}
 if(!valid)throw denied();
 // Scope user IDs to the Access team, not to a browser-supplied name.
 const team=origin.slice(8).split('.')[0];
 return Object.freeze({
  userId:'cloudflare-access:'+team+':'+payload.sub,
  email:payload.email,
  fullName:typeof payload.name==='string'&&payload.name.length<=120?payload.name:null
 });
}
/**
 * Strip *all* forged or legacy Sites headers before inserting cryptographically
 * verified Access identity. Keep these headers internal to the next framework.
 */
export function identityRequest(request,identity){
 const headers=new Headers(request.headers);
 for(const key of headers.keys())if(key.startsWith('oai-authenticated-user-'))headers.delete(key);
 headers.set('oai-authenticated-user-id',identity.userId);
 headers.set('oai-authenticated-user-email',identity.email);
 if(identity.fullName){
  headers.set('oai-authenticated-user-full-name',encodeURIComponent(identity.fullName));
  headers.set('oai-authenticated-user-full-name-encoding','percent-encoded-utf-8');
 }
 headers.delete('cf-access-jwt-assertion');
 return new Request(request,{headers});
}
