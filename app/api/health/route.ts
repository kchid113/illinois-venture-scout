import {NextResponse} from 'next/server';
import {all} from '@/lib/radar';

// A public readiness probe: reports only aggregate published-data availability.
// This never queries or exposes workspace, credentials, candidates or admin data.
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store, max-age=0'};
const countsSql=`SELECT
 (SELECT count(*) FROM companies c WHERE EXISTS (
  SELECT 1 FROM claims cl JOIN evidence e
   ON e.claim_id=cl.id AND e.relationship='supports'
  WHERE cl.company_id=c.id AND cl.status IN ('Published','Conflicting')
 )) AS companies,
 (SELECT count(*) FROM sources) AS sources,
 (SELECT count(*) FROM claims cl WHERE cl.status IN ('Published','Conflicting')
  AND EXISTS (SELECT 1 FROM evidence e WHERE e.claim_id=cl.id AND e.relationship='supports')
 ) AS supported_claims`;

export async function GET(){
 try{
  const [row]=await all(countsSql);
  const companies=Number(row?.companies);
  const sources=Number(row?.sources);
  const supportedClaims=Number(row?.supported_claims);
  if(![companies,sources,supportedClaims].every(Number.isSafeInteger))
   throw Error('Invalid database aggregate');
  if(companies<1||sources<1||supportedClaims<1)
   return NextResponse.json({status:'not-ready',reason:'published-data-empty'},
    {status:503,headers});
  return NextResponse.json({status:'ready',companies,sources,supportedClaims},{headers});
 }catch{
  // Database configuration, credentials and query error messages are server-only.
  return NextResponse.json({status:'not-ready',reason:'database-unavailable'},
   {status:503,headers});
 }
}
