import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {isAdmin} from '@/lib/admin';
import {all,database} from '@/lib/radar';
import {decideSourceCandidate,ReviewError} from '@/core/review-service.mjs';
export const dynamic='force-dynamic';

export async function GET(req:NextRequest){
 if(!await isAdmin(req))return NextResponse.json({error:'Administrator authorization required'},{status:401});
 const rows=await all("SELECT id,connector,source_url,publisher,title,excerpt,company_name,company_id,event_date,observed_at,last_checked,status,payload FROM source_candidates WHERE status='Pending' ORDER BY observed_at DESC LIMIT 100");
 const stats=await all("SELECT connector,status,count(*) count FROM source_candidates GROUP BY connector,status ORDER BY connector,status");
 const candidates=rows.map(r=>{
  let canCreate=false,reviewUrl:null|string=null;
  try{
   const payload=JSON.parse(String(r.payload||'{}'));
   const url=r.connector==='iventure-cohorts'?payload.ventureWebsite:r.connector==='enterpriseworks-directory'?payload.profileUrl:null;
   if(typeof url==='string'){
    const u=new URL(url);
    if(u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!(r.connector==='enterpriseworks-directory'&&u.hostname!=='researchpark.illinois.edu')){
     reviewUrl=u.href;
    }
   }
   canCreate=!r.company_id&&!!reviewUrl&&['iventure-cohorts','enterpriseworks-directory'].includes(String(r.connector));
  }catch{}
  const candidate={...r};
  delete candidate.payload;
  return {...candidate,canCreate,reviewUrl};
 });
 return NextResponse.json({candidates,stats});
}

const body=z.object({id:z.string().regex(/^[a-f0-9]{64}$/),decision:z.enum(['approve','reject','create'])}).strict();
export async function POST(req:NextRequest){
 if(!await isAdmin(req))return NextResponse.json({error:'Administrator authorization required'},{status:401});
 if(req.headers.has('origin')&&req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Invalid origin'},{status:403});
 const parsed=body.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Invalid review action'},{status:400});
 try{
  return NextResponse.json(await decideSourceCandidate(database(),{id:parsed.data.id,decision:parsed.data.decision}));
 }catch(error){
  const status=error instanceof ReviewError?error.status:500;
  return NextResponse.json({error:error instanceof Error?error.message:'Review failed'},{status});
 }
}
