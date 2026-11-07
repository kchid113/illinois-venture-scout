import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {isAdmin} from '@/lib/admin';
import {getInvestorUser} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {validatePrivateContact} from '@/core/founder-outreach.mjs';
import {all,company,companies,summary,signalsFor} from '@/lib/radar';

export const dynamic='force-dynamic';
const privateItem=z.object({
 kind:z.enum(['watchlist','note','status','search','thesis','report','contact']),
 key:z.string().min(1).max(150),
 value:z.string().max(40000)
}).strict();

export async function GET(req:NextRequest){
 const user=await getInvestorUser();
 if(!user)return NextResponse.json({error:'Sign in required'},{status:401});
 try{
  const p=req.nextUrl.searchParams;
  const view=p.get('view');
  if(view==='workspace'){
   const supabase=await createClient();
   // Supabase/PostgREST RLS independently enforces the authenticated owner.
   const {data,error}=await supabase.from('workspace').select('kind,key,value').eq('user_id',user.userId);
   if(error)throw error;
   return NextResponse.json({local:false,admin:await isAdmin(),items:data||[]});
  }
  if(view==='summary')return NextResponse.json(await summary());
  if(view==='company')return NextResponse.json(await company(z.string().max(150).parse(p.get('id'))));
  if(view==='sources')return NextResponse.json(await all('SELECT * FROM sources ORDER BY last_checked DESC'));
  if(view==='signals')return NextResponse.json(await signalsFor());
  return NextResponse.json(await companies(
   (p.get('q')||'').slice(0,120),(p.get('sector')||'').slice(0,100),
   (p.get('affiliation')||'').slice(0,100),p.get('sort')||'name',
   Math.max(1,Math.min(1000,Number(p.get('page'))||1))
  ));
 }catch{return NextResponse.json({error:'Unable to load research data. Please retry.'},{status:500});}
}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)
  return NextResponse.json({error:'Invalid origin'},{status:403});
 const user=await getInvestorUser();
 if(!user)return NextResponse.json({error:'Sign in required'},{status:401});
 try{
  const item=privateItem.parse(await req.json());
  if(item.kind==='contact')item.value=JSON.stringify(validatePrivateContact(JSON.parse(item.value)));
  const supabase=await createClient();
  const {error}=await supabase.from('workspace').upsert({
   user_id:user.userId,kind:item.kind,key:item.key,value:item.value,
   updated_at:new Date().toISOString()
  },{onConflict:'user_id,kind,key'});
  if(error)throw error;
  return NextResponse.json({ok:true});
 }catch{return NextResponse.json({error:'Unable to save private research'},{status:400});}
}
