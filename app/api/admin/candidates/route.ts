import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {isAdmin} from '@/lib/admin';
import {all,database} from '@/lib/radar';
import {approvalStatements} from '@/core/source-candidates.mjs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 if(!await isAdmin(req))return NextResponse.json({error:'Administrator authorization required'},{status:401});
 const rows=await all("SELECT id,connector,source_url,publisher,title,excerpt,company_name,company_id,event_date,observed_at,last_checked,status FROM source_candidates WHERE status='Pending' ORDER BY observed_at DESC LIMIT 100");
 const stats=await all("SELECT connector,status,count(*) count FROM source_candidates GROUP BY connector,status ORDER BY connector,status");
 return NextResponse.json({candidates:rows,stats});
}
const body=z.object({id:z.string().regex(/^[a-f0-9]{64}$/),decision:z.enum(['approve','reject'])}).strict();
export async function POST(req:NextRequest){
 if(!await isAdmin(req))return NextResponse.json({error:'Administrator authorization required'},{status:401});
 if(req.headers.has('origin')&&req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Invalid origin'},{status:403});
 const parsed=body.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Invalid review action'},{status:400});
 const rows=await all('SELECT * FROM source_candidates WHERE id=?',parsed.data.id);
 if(rows.length!==1||rows[0].status!=='Pending')return NextResponse.json({error:'Candidate is not pending'},{status:409});
 const row=rows[0] as Record<string,string|null>;
 if(parsed.data.decision==='approve'){
  if(!row.company_id)return NextResponse.json({error:'Resolve the exact company identity before approval'},{status:422});
  const owners=await all('SELECT id,name FROM companies WHERE id=?',row.company_id);
  if(owners.length!==1||owners[0].name!==row.company_name)return NextResponse.json({error:'Candidate company identity no longer matches'},{status:409});
 }
 const now=new Date().toISOString();
 try{
  const ops=parsed.data.decision==='approve'?await approvalStatements(row,now):[];
  ops.push({sql:"UPDATE source_candidates SET status=? WHERE id=? AND status='Pending'",values:[parsed.data.decision==='approve'?'Approved':'Rejected',row.id]});
  ops.push({sql:'INSERT INTO audit(id,actor,action,target,created_at) VALUES(?,?,?,?,?)',values:[crypto.randomUUID(),'administrator',`candidate-${parsed.data.decision}`,row.id,now]});
  await database().batch(ops.map(o=>database().prepare(o.sql).bind(...o.values)));
  return NextResponse.json({ok:true,status:parsed.data.decision==='approve'?'Approved':'Rejected'});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Review failed'},{status:500});}
}
