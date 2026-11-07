import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';

export async function proxy(request:NextRequest){
 const pathname=request.nextUrl.pathname;
 const publicRoute=pathname==='/login'||pathname.startsWith('/auth/callback')||pathname==='/auth/confirm';
 const cronRoute=pathname.startsWith('/api/cron/');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)return new Response('Supabase Auth configuration is missing',{status:503});

 let response=NextResponse.next({request});
 const supabase=createServerClient(url,key,{
  cookies:{
   getAll(){return request.cookies.getAll();},
   setAll(values){
    for(const {name,value} of values)request.cookies.set(name,value);
    response=NextResponse.next({request});
    for(const {name,value,options} of values)response.cookies.set(name,value,options);
   }
  }
 });
 const {data}=await supabase.auth.getClaims();
 const authenticated=!!data?.claims?.sub;
 if(!authenticated&&!publicRoute&&!cronRoute){
  if(pathname.startsWith('/api/'))return NextResponse.json({error:'Sign in required'},{status:401});
  const redirectTo=request.nextUrl.clone();redirectTo.pathname='/login';redirectTo.search='';
  return NextResponse.redirect(redirectTo);
 }
 if(authenticated&&pathname==='/login'){
  const to=request.nextUrl.clone();to.pathname='/';to.search='';
  return NextResponse.redirect(to);
 }
 response.headers.set('Cache-Control','private, no-store');
 return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)']};
