import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {all,company,companies,summary,signalsFor} from '@/lib/radar';

// Browsing is public; the database is accessed only through the server-side pooler.
// Personal research is written to localStorage by the client, never to these endpoints.
export const runtime='nodejs';
export const dynamic='force-dynamic';
const noStore={'Cache-Control':'public, max-age=0, must-revalidate'};
export async function GET(req:NextRequest){
 try{
  const p=req.nextUrl.searchParams;
  const view=p.get('view');
  if(view==='workspace')return NextResponse.json({error:'Personal research is stored in this browser'},{status:403});
  if(view==='summary'){
   // Job messages are operational details; do not expose them on the public API.
   const {jobs:ignored,...publicSummary}=await summary();
   void ignored;
   return NextResponse.json({...publicSummary,jobs:[]},{headers:noStore});
  }
  if(view==='company'){
   const id=z.string().max(150).parse(p.get('id'));
   return NextResponse.json(await company(id),{headers:noStore});
  }
  if(view==='sources')return NextResponse.json(await all('SELECT * FROM sources ORDER BY last_checked DESC'),{headers:noStore});
  if(view==='signals')return NextResponse.json(await signalsFor(),{headers:noStore});
  return NextResponse.json(await companies(
   (p.get('q')||'').slice(0,120),(p.get('sector')||'').slice(0,100),
   (p.get('affiliation')||'').slice(0,100),p.get('sort')||'name',
   Math.max(1,Math.min(1000,Number(p.get('page'))||1))
  ),{headers:noStore});
 }catch{return NextResponse.json({error:'Unable to load research data. Please retry.'},{status:500});}
}
// Explicitly disable the old account-workspace write surface in public mode.
export async function POST(){
 return NextResponse.json({error:'Server-side personal workspace writes are disabled'},{status:403});
}
