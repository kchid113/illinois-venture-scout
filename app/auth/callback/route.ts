import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';

/** PKCE code exchange and invitation-safe token-hash confirmation. */
export async function GET(req:NextRequest){
 const code=req.nextUrl.searchParams.get('code');
 const hash=req.nextUrl.searchParams.get('token_hash');
 const type=req.nextUrl.searchParams.get('type');
 const supabase=await createClient();
 let error;
 if(code)({error}=await supabase.auth.exchangeCodeForSession(code));
 else if(hash&&(type==='email'||type==='invite'))
  ({error}=await supabase.auth.verifyOtp({token_hash:hash,type}));
 else return NextResponse.redirect(new URL('/login?error=invalid-link',req.url));
 if(error)return NextResponse.redirect(new URL('/login?error=expired-link',req.url));
 return NextResponse.redirect(new URL('/',req.url));
}
