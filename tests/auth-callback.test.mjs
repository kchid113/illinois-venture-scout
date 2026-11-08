import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {classifyAuthCallback} from '../core/auth-callback.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('default Supabase hosted confirmation URLs with implicit hash tokens are supported',()=>{
 const route=classifyAuthCallback('https://staging.vercel.app/auth/callback#access_token=private-access&refresh_token=private-refresh&token_type=bearer&type=magiclink');
 assert.deepEqual(route,{kind:'implicit-session',accessToken:'private-access',refreshToken:'private-refresh'});
});
test('PKCE authorization codes are handled without requiring a custom email template',()=>{
 assert.deepEqual(classifyAuthCallback('https://staging.vercel.app/auth/callback?code=one-time-code'),
  {kind:'code',code:'one-time-code'});
});
test('token-hash magic links and invites both work when templates are customizable',()=>{
 for(const type of ['email','invite'])
  assert.deepEqual(classifyAuthCallback('https://app.invalid/auth/callback?type='+type+'&token_hash=one-time-hash'),
   {kind:'token-hash',tokenHash:'one-time-hash',type});
});
test('rejected and already consumed email links show a safe error instead of an empty page',()=>{
 assert.deepEqual(classifyAuthCallback('https://app.invalid/auth/callback#error=access_denied&error_code=otp_expired'),
  {kind:'error',reason:'expired'});
 assert.deepEqual(classifyAuthCallback('https://app.invalid/auth/callback?error=access_denied&error_description=secret'),
  {kind:'error',reason:'rejected'});
});
test('client callback replaces obsolete server route and clears sensitive browser URL',()=>{
 assert.equal(existsSync(new URL('../app/auth/callback/route.ts',import.meta.url)),false);
 const component=read('app/auth/callback/page.tsx');
 assert.match(component,/history\.replaceState/);
 assert.match(component,/auth\.setSession/);
 assert.match(component,/auth\.exchangeCodeForSession/);
 assert.match(component,/auth\.verifyOtp/);
 assert.match(component,/auth\.getUser/);
 assert.match(component,/window\.location\.replace\('\/'\)/);
 assert.doesNotMatch(component,/console\.log/);
});
