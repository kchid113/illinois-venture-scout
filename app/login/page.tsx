'use client';
import {useState,type FormEvent} from 'react';
import {createClient} from '@/lib/supabase/client';
import {Mail,ArrowRight,ShieldCheck} from 'lucide-react';

export default function LoginPage(){
 const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState('');
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError('');
  try{
   const client=createClient();
   const {error:failure}=await client.auth.signInWithOtp({
    email:email.trim(),
    options:{shouldCreateUser:false,emailRedirectTo:window.location.origin+'/auth/callback'}
   });
   if(failure)throw failure;
   setSent(true);
  }catch(e){setError(e instanceof Error?e.message:'Unable to send sign-in link');}
  finally{setBusy(false);}
 }
 return <main className="auth-screen"><section className="auth-panel">
  <div className="auth-crest" aria-hidden="true">I</div>
  <div className="eyebrow">ILLINOIS VENTURE RADAR</div>
  <h1>Independent research. Private by design.</h1>
  <p>Sign in with your invited investor email to explore documented UIUC startups, review evidence, and manage your private research.</p>
  {sent?<div role="status" className="auth-success"><Mail size={22}/><strong>Check your email</strong><span>Open the secure sign-in link sent to {email}. If you are not invited, contact the administrator.</span></div>:
  <form onSubmit={submit}>
   <label htmlFor="investor-email">Investor email</label>
   <input id="investor-email" type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="investor@firm.com"/>
   {error&&<p role="alert" className="error">{error}</p>}
   <button className="primary" type="submit" disabled={busy}>{busy?'Sending…':'Send secure sign-in link'} <ArrowRight size={17}/></button>
  </form>}
  <div className="auth-footer"><ShieldCheck size={16}/> Invitation only · Account-isolated notes, contacts, and watchlists</div>
 </section></main>;
}
