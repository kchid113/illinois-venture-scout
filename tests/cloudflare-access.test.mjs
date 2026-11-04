import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCloudflareAccess,identityRequest,CloudflareAccessError} from '../core/cloudflare-access.mjs';

const TEAM='https://example-student.cloudflareaccess.com';
const AUD='venture-illinois-audience-123';
const env={IVR_ACCESS_TEAM_DOMAIN:TEAM,IVR_ACCESS_AUD:AUD};
const now=Date.now();
const nowSeconds=Math.floor(now/1000);
const header={alg:'RS256',kid:'test-rotate-1',typ:'JWT'};
const goodPayload={
 iss:TEAM,aud:[AUD],iat:nowSeconds-45,exp:nowSeconds+300,
 sub:'github-student-user-7',email:'student@example.edu',name:'Test Student'
};
const encoded=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
const keyPromise=crypto.subtle.generateKey({
 name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
 publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'
},true,['sign','verify']);
async function makeToken(payload=goodPayload,head=header){
 const keys=await keyPromise;
 const data=encoded(head)+'.'+encoded(payload);
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(data));
 return data+'.'+Buffer.from(signature).toString('base64url');
}
async function options(){
 const keys=await keyPromise;
 const key=await crypto.subtle.exportKey('jwk',keys.publicKey);
 return {clock:()=>now,cache:new Map(),fetcher:async(url,init)=>{
  assert.equal(url,TEAM+'/cdn-cgi/access/certs');
  assert.equal(init.method,'GET');
  assert.equal(init.redirect,'error');
  return new Response(JSON.stringify({keys:[{...key,kid:header.kid,alg:'RS256',use:'sig'}]}));
 }};
}
const req=token=>new Request('https://venture.example.com/api/data?view=workspace',{
 headers:{'Cf-Access-Jwt-Assertion':token,'oai-authenticated-user-id':'forged-admin',
 'oai-authenticated-user-email':'attacker@example.com'}
});
test('valid Cloudflare Access RS256 JWT produces team-scoped user identity',async()=>{
 const verified=await verifyCloudflareAccess(req(await makeToken()),env,await options());
 assert.equal(verified.userId,'cloudflare-access:example-student:github-student-user-7');
 assert.equal(verified.email,'student@example.edu');
 assert.equal(verified.fullName,'Test Student');
 assert.ok(Object.isFrozen(verified));
});
test('verified Request overwrites all user-controllable legacy Sites headers',async()=>{
 const identity=await verifyCloudflareAccess(req(await makeToken()),env,await options());
 const injected=identityRequest(req(await makeToken()),identity);
 assert.equal(injected.headers.get('oai-authenticated-user-id'),identity.userId);
 assert.equal(injected.headers.get('oai-authenticated-user-email'),identity.email);
 assert.equal(injected.headers.get('oai-authenticated-user-full-name'),encodeURIComponent('Test Student'));
 assert.equal(injected.headers.get('cf-access-jwt-assertion'),null);
 assert.equal(new URL(injected.url).pathname,'/api/data');
});
test('never trust a caller-supplied Sites identity without a signed Access assertion',async()=>{
 await assert.rejects(verifyCloudflareAccess(new Request('https://venture.example.com/',{
  headers:{'oai-authenticated-user-id':'admin','oai-authenticated-user-email':'admin@example.com'}
 }),env,await options()),CloudflareAccessError);
});
const badCases=[
 ['wrong issuer',{iss:'https://evil.cloudflareaccess.com'}],
 ['wrong audience',{aud:['other-application-audience']}],
 ['expired',{exp:nowSeconds-1}],
 ['expired boundary',{exp:nowSeconds}],
 ['future iat',{iat:nowSeconds+400}],
 ['future nbf',{nbf:nowSeconds+400}],
 ['missing subject',{sub:null}],
 ['too long subject',{sub:'x'.repeat(201)}],
 ['missing email',{email:undefined}],
 ['invalid email',{email:'local-only'}],
 ['service principal',{common_name:'service-token'}],
 ['improper audience type',{aud:[123,null]}],
 ['non-integer expiry',{exp:'never'}],
 ['non-integer issue time',{iat:undefined}]
];
for(const [name,patch] of badCases){
 test('Access denies invalid claims: '+name,async()=>{
  const token=await makeToken({...goodPayload,...patch});
  await assert.rejects(verifyCloudflareAccess(req(token),env,await options()),CloudflareAccessError);
 });
}
test('Access denies unsigned jwt algorithm none',async()=>{
 await assert.rejects(
  verifyCloudflareAccess(req(await makeToken(goodPayload,{alg:'none',kid:header.kid})),env,await options()),
  CloudflareAccessError
 );
});
test('Access denies mismatched JWT key id',async()=>{
 await assert.rejects(
  verifyCloudflareAccess(req(await makeToken(goodPayload,{...header,kid:'unknown-key'})),env,await options()),
  CloudflareAccessError
 );
});
test('Access denies tampered signed subject, email, and expiration',async()=>{
 const token=await makeToken();
 for(const patch of [{sub:'admin'},{email:'admin@example.com'},{exp:nowSeconds+5000}]){
  const parts=token.split('.');
  parts[1]=encoded({...goodPayload,...patch});
  await assert.rejects(verifyCloudflareAccess(req(parts.join('.')),env,await options()),CloudflareAccessError);
 }
});
for(const token of ['','one.two','a.b.c.d','not-a-jwt', 'a'.repeat(12001),null]){
 test('Access denies malformed JWT representation '+String(token).slice(0,32),async()=>{
  const request=token===null?new Request('https://venture.example.com/'):req(token);
  await assert.rejects(verifyCloudflareAccess(request,env,await options()),CloudflareAccessError);
 });
}
test('Access denies invalid team domains and audience config',async()=>{
 const token=await makeToken();
 for(const envPatch of [
  {IVR_ACCESS_TEAM_DOMAIN:'https://evil.example.com'},
  {IVR_ACCESS_TEAM_DOMAIN:'http://example-student.cloudflareaccess.com'},
  {IVR_ACCESS_TEAM_DOMAIN:'https://example-student.cloudflareaccess.com.attacker.test'},
  {IVR_ACCESS_AUD:''},{IVR_ACCESS_AUD:'a'}
 ]){
  await assert.rejects(verifyCloudflareAccess(req(token),{...env,...envPatch},await options()),CloudflareAccessError);
 }
});
for(const status of [301,401,403,429,500]){
 test('Access denies failed JWKS request without leaking a JWT '+status,async()=>{
  const optionsMock=await options();
  optionsMock.fetcher=async()=>new Response('upstream failed',{status});
  await assert.rejects(verifyCloudflareAccess(req(await makeToken()),env,optionsMock),CloudflareAccessError);
 });
}
test('Access rejects JWKS missing usable RSA signing keys',async()=>{
 const opts=await options();
 opts.fetcher=async()=>new Response(JSON.stringify({keys:[{kty:'oct',kid:'test-rotate-1'}]}));
 await assert.rejects(verifyCloudflareAccess(req(await makeToken()),env,opts),CloudflareAccessError);
});
test('Access caches valid JWKS within TTL but never skips signature verification',async()=>{
 const opts=await options();
 const upstream=opts.fetcher;let calls=0;
 opts.fetcher=async(...args)=>{calls++;return upstream(...args);};
 const good=await makeToken();
 for(let i=0;i<3;i++)assert.equal((await verifyCloudflareAccess(req(good),env,opts)).email,'student@example.edu');
 assert.equal(calls,1);
 const parts=good.split('.');parts[1]=encoded({...goodPayload,email:'attacker@example.com'});
 await assert.rejects(verifyCloudflareAccess(req(parts.join('.')),env,opts),CloudflareAccessError);
 assert.equal(calls,1);
});
test('Worker retains no unguarded path for public API or private research',()=>{
 const worker=String(requireRead('worker/cloudflare-index.ts'));
 assert.match(worker,/verifyCloudflareAccess\(request,env\)/);
 assert.match(worker,/identityRequest\(request,identity\)/);
 assert.match(worker,/status:403/);
 assert.ok(worker.indexOf('verifyCloudflareAccess(request,env)')<worker.indexOf('handler.fetch(verified,env,ctx)'));
});
function requireRead(path){return readFileSync(new URL('../'+path,import.meta.url),'utf8');}
import {readFileSync} from 'node:fs';
