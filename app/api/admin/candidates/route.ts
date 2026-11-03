import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {isAdmin} from '@/lib/admin';
import {all,database} from '@/lib/radar';
import {approvalStatements,newIVentureCompany,matchCompany} from '@/core/source-candidates.mjs';
export const dynamic='force-dynamic';

export async function GET(req:NextRequest){
 if(!await isAdmin(req))return NextResponse.json({error:'Administrator authorization required'},{status:401});
 const rows=await all("SELECT id,connector,source_url,publisher,title,excerpt,company_name,company_id,event_date,observed_at,last_checked,status,payload FROM source_candidates WHERE status='Pending' ORDER BY observed_at DESC LIMIT 100");
 const stats=await all("SELECT connector,status,count(*) count FROM source_candidates GROUP BY connector,status ORDER BY connector,status");
 const candidates=rows.map(r=>{
  let canCreate=false;
  try{const payload=JSON.parse(String(r.payload||'{}'));canCreate=r.connector==='iventure-cohorts'&&!r.company_id&&!!payload.ventureWebsite;}catch{}
  const {payload:_,...candidate}=r;
  return {...candidate,canCreate};
 });
 return NextResponse.json({candidates,stats});
}

const body=z.object({id:z.string().regex(/^[a-f0-9]{64}$/),decision:z.enum(['approve','reject','create'])}).strict();
export async function POST(req:NextRequest){
 if(!await isAdmin(req))return NextResponse.json({error:'Administrator authorization required'},{status:401});
 if(req.headers.has('origin')&&req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Invalid origin'},{status:403});
 const parsed=body.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Invalid review action'},{status:400});
 const rows=await all('SELECT * FROM source_candidates WHERE id=?',parsed.data.id);
 if(rows.length!==1||rows[0].status!=='Pending')return NextResponse.json({error:'Candidate is not pending'},{status:409});
 const row=rows[0] as Record<string,string|null>;
 const decision=parsed.data.decision,now=new Date().toISOString();
 try{
  let reviewRow=row;
  const ops:{sql:string;values:unknown[]}[]=[];
  if(decision==='create'){
   if(row.connector!=='iventure-cohorts'||row.company_id)return NextResponse.json({error:'Only unmatched official iVenture cohort ventures may be created'},{status:422});
   const existing=await all('SELECT id,name,profile FROM companies');
   if(matchCompany(row.company_name,existing as {id:string;name:string}[]))return NextResponse.json({error:'A tracked company with this name already exists; review its identity first'},{status:409});
   const {companyId,statement}=await newIVentureCompany(row,now);
   if(existing.some(e=>e.id===companyId||e.profile===statement.values[2]))return NextResponse.json({error:'Venture ID or official website is already tracked'},{status:409});
   ops.push(statement);
   reviewRow={...row,company_id:companyId};
  }else if(decision==='approve'){
   if(!row.company_id)return NextResponse.json({error:'Resolve the exact company identity before approval'},{status:422});
   const owners=await all('SELECT id,name FROM companies WHERE id=?',row.company_id);
   if(owners.length!==1||owners[0].name!==row.company_name)return NextResponse.json({error:'Candidate company identity no longer matches'},{status:409});
  }
  if(decision==='approve'||decision==='create')ops.push(...await approvalStatements(reviewRow,now));
  ops.push({sql:"UPDATE source_candidates SET company_id=COALESCE(?,company_id),status=? WHERE id=? AND status='Pending'",values:[reviewRow.company_id,decision==='reject'?'Rejected':'Approved',row.id]});
  ops.push({sql:'INSERT INTO audit(id,actor,action,target,created_at) VALUES(?,?,?,?,?)',values:[crypto.randomUUID(),'administrator','candidate-'+decision,row.id,now]});
  await database().batch(ops.map(o=>database().prepare(o.sql).bind(...o.values)));
  return NextResponse.json({ok:true,status:decision==='reject'?'Rejected':'Approved',companyId:reviewRow.company_id});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Review failed'},{status:500});}
}
