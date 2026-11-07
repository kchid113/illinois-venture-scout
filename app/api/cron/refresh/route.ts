import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {database} from '@/lib/radar';
import {refreshConnector} from '@/core/refresh-runner.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const sources=['research-park-1','research-park-2','research-park-3',
 'research-park-4','research-park-5','enterpriseworks-directory','iventure-cohorts'] as const;
const authorized=(bearer:string|null)=>{
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<32||!bearer?.startsWith('Bearer '))return false;
 const a=Buffer.from(bearer.slice(7));const b=Buffer.from(secret);
 return a.length===b.length&&timingSafeEqual(a,b);
};
export async function GET(req:NextRequest){
 if(!authorized(req.headers.get('authorization')))
  return NextResponse.json({error:'Forbidden'},{status:403});
 // One bounded official source per invocation; leases prevent overlapping refreshes.
 // OTM is deliberately excluded: its robots policy prohibits automated retrieval.
 const index=Math.floor(Date.now()/86400000)%sources.length;
 const connector=sources[index];
 try{
  const receipt=await refreshConnector(database(),connector);
  return NextResponse.json({ok:true,...receipt});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:'Refresh failed',connector},{status:503});
 }
}
