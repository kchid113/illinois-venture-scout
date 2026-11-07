import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Invalid origin'},{status:403});
 const supabase=await createClient();
 await supabase.auth.signOut();
 return NextResponse.redirect(new URL('/login',req.url),{status:303});
}
