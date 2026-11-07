import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';

export type InvestorUser={userId:string;email:string;displayName:string;fullName:string|null};
/** Freshly validate user identity at Supabase Auth, never trust client headers. */
export async function getInvestorUser():Promise<InvestorUser|null>{
 const supabase=await createClient();
 const {data,error}=await supabase.auth.getUser();
 if(error||!data.user||!data.user.email)return null;
 const user=data.user;
 const email=user.email;
 if(!email)return null;
 return {
  userId:user.id,
  email,
  displayName:email,
  fullName:null
 };
}
export async function requireInvestorUser():Promise<InvestorUser>{
 const user=await getInvestorUser();
 if(!user)redirect('/login');
 return user;
}
