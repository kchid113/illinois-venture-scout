import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {isAdmin} from '@/lib/admin';
import {database} from '@/lib/radar';
import {CONNECTORS} from '@/core/source-candidates.mjs';
import {refreshConnector} from '@/core/refresh-runner.mjs';
export const dynamic='force-dynamic';
const schema=z.object({connector:z.enum(CONNECTORS as [string,...string[]])}).strict();
export async function POST(req:NextRequest){
 if(!await isAdmin(req))return NextResponse.json({error:'Administrator authorization required'},{status:401});
 if(req.headers.has('origin')&&req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Invalid origin'},{status:403});
 const parsed=schema.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Specify an allowed public data source'},{status:400});
 try{return NextResponse.json(await refreshConnector(database(),parsed.data.connector));}
 catch(error){
  const message=error instanceof Error?error.message:'Refresh failed';
  return NextResponse.json({error:message},{status:message.includes('already running')?409:502});
 }
}
