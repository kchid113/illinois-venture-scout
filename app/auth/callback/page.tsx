'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ShieldCheck,Mail,ArrowRight} from 'lucide-react';
import {createClient} from '@/lib/supabase/client';
import {classifyAuthCallback} from '@/core/auth-callback.mjs';

export default function AuthCallbackPage(){
 const [status,setStatus]=useState<'confirming'|'failed'>('confirming');
 const [message,setMessage]=useState('');
 useEffect(()=>{
  let active=true;
  async function complete(){
   const callback=classifyAuthCallback(window.location.href);
   // Clear one-time codes and tokens from address bar and browser history.
   // Keep their values only in memory until Supabase completes verification.
   const client=createClient();
   window.history.replaceState(window.history.state,'','/auth/callback');
   try{
    if(callback.kind==='error')
     throw Error(callback.reason==='expired'
      ?'This sign-in link has expired or was already used. Request a fresh link.'
      :'Supabase rejected this sign-in link. Check the configured redirect URL and request a fresh link.');
    if(callback.kind==='code'){
     const {error}=await client.auth.exchangeCodeForSession(callback.code);
     if(error)throw error;
    }else if(callback.kind==='token-hash'){
     const {error}=await client.auth.verifyOtp({token_hash:callback.tokenHash,type:callback.type});
     if(error)throw error;
    }else if(callback.kind==='implicit-session'){
     // Supabase's default hosted email template can redirect with tokens in
     // the URL fragment, which the old server callback could never inspect.
     const {data}=await client.auth.getSession();
     if(!data.session){
      const {error}=await client.auth.setSession({
       access_token:callback.accessToken,refresh_token:callback.refreshToken
      });
      if(error)throw error;
     }
    }
    // Revalidate identity server-side at Supabase before granting app access.
    const {data,error}=await client.auth.getUser();
    if(error||!data.user)throw Error('The link did not establish a verified session.');
    window.location.replace('/');
   }catch(error){
    if(!active)return;
    setMessage(error instanceof Error&&/expired|already used|rejected/i.test(error.message)
     ?error.message
     :'We could not complete sign-in. The link may have expired, been opened in another browser, or been used already. Request a new one.');
    setStatus('failed');
   }
  }
  void complete();
  return ()=>{active=false;};
 },[]);
 return <main className="auth-screen"><section className="auth-panel">
  <div className="auth-crest" aria-hidden="true">I</div>
  <div className="eyebrow">ILLINOIS VENTURE RADAR</div>
  {status==='confirming'?<><ShieldCheck size={25}/><h1>Confirming your sign-in</h1>
    <p role="status">Checking your secure Supabase email link and opening your private research workspace…</p></>:
   <><Mail size={25}/><h1>Sign-in link could not be verified</h1>
    <p role="alert">{message}</p>
    <Link className="primary" href="/login">Request a fresh sign-in link <ArrowRight size={17}/></Link></>}
  <div className="auth-footer"><ShieldCheck size={16}/> Investor accounts are private and invitation-only</div>
 </section></main>;
}
