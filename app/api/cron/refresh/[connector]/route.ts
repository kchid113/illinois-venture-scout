import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {database} from '@/lib/radar';
import {refreshConnector} from '@/core/refresh-runner.mjs';
import {isScheduledConnector,executeScheduledConnector} from '@/core/source-schedule.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

function authorized(header:string|null){
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<32||!header?.startsWith('Bearer '))return false;
 const actual=Buffer.from(header.slice(7)),expected=Buffer.from(secret);
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export async function GET(req:NextRequest,{params}:{params:Promise<{connector:string}>}){
 const headers={'Cache-Control':'private, no-store'};
 if(!authorized(req.headers.get('authorization')))
  return NextResponse.json({error:'Forbidden'},{status:403,headers});
 const {connector}=await params;
 if(!isScheduledConnector(connector))
  return NextResponse.json({error:'Unknown scheduled source'},{status:404,headers});
 try{
  const outcome=await executeScheduledConnector(connector,{db:database(),refresh:refreshConnector});
  return NextResponse.json({ok:true,...outcome},{headers});
 }catch(error){
  // Persisted ingestion_jobs contains the full outcome and source error.
  const message=error instanceof Error?error.message:'Unspecified source failure';
  console.error('Scheduled source refresh failed',connector,message.slice(0,220));
  return NextResponse.json({error:'Source refresh failed; inspect ingestion job history',connector},
   {status:503,headers});
 }
}
