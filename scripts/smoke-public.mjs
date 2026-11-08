import {pathToFileURL} from 'node:url';

function assertOrigin(input){
 let url;
 try{url=new URL(input);}catch{throw Error('Provide an absolute deployment URL');}
 const local=url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname);
 const hosted=url.protocol==='https:'&&url.hostname.endsWith('.vercel.app')&&url.hostname.length>11;
 if(!local&&!hosted||url.username||url.password||url.search||url.hash||
    url.pathname!=='/'||(!local&&url.port))
  throw Error('Use a Vercel HTTPS deployment origin or a localhost test origin');
 return url.origin;
}
async function getJson(fetcher,origin,path){
 let response;
 try{
  response=await fetcher(origin+path,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
 }catch{throw Error('Deployment is unreachable at '+path);}
 if(!response.ok)
  throw Error('Deployment returned HTTP '+response.status+' at '+path);
 const contentType=response.headers.get('content-type')||'';
 if(!contentType.toLowerCase().includes('application/json'))
  throw Error('Deployment returned non-JSON content at '+path);
 try{return await response.json();}
 catch{throw Error('Deployment returned invalid JSON at '+path);}
}
export async function probePublicResearch(origin,fetcher=fetch){
 origin=assertOrigin(origin);
 const health=await getJson(fetcher,origin,'/api/health');
 if(health?.status!=='ready'||!Number.isSafeInteger(health.companies)||health.companies<1)
  throw Error('Public research health check did not confirm a populated database');
 const summary=await getJson(fetcher,origin,'/api/data?view=summary');
 if(!Number.isSafeInteger(summary?.companies)||summary.companies<1||
    !Number.isSafeInteger(summary.claims)||summary.claims<1||
    !Number.isSafeInteger(summary.sources)||summary.sources<1)
  throw Error('Public summary did not include source-backed data');
 if(summary.companies!==health.companies)
  throw Error('Health and public summary company totals differ');
 if(!Array.isArray(summary.jobs)||summary.jobs.length)
  throw Error('Public summary disclosed internal ingestion jobs');
 const list=await getJson(fetcher,origin,'/api/data?page=1');
 if(!Number.isSafeInteger(list?.total)||list.total<1||
    !Array.isArray(list.companies)||list.companies.length<1)
  throw Error('Public company discovery returned no records');
 const selected=list.companies[0];
 if(typeof selected.id!=='string'||!selected.id||!Array.isArray(selected.claims)||
    !selected.claims.some(c=>Array.isArray(c.evidence)&&c.evidence.some(e=>e.relationship==='supports'&&typeof e.url==='string')))
  throw Error('Public company listing omitted supporting evidence');
 const company=await getJson(fetcher,origin,
  '/api/data?view=company&id='+encodeURIComponent(selected.id));
 if(company?.id!==selected.id||!Array.isArray(company.claims)||company.claims.length===0)
  throw Error('Company detail route did not return its supported claims');
 const sources=await getJson(fetcher,origin,'/api/data?view=sources');
 if(!Array.isArray(sources)||sources.length<1||!sources.every(s=>typeof s.url==='string'))
  throw Error('Original source list is missing or malformed');
 // No destructive requests: verify the retired workspace is not publicly readable.
 let workspace;
 try{
  workspace=await fetcher(origin+'/api/data?view=workspace',{redirect:'error',signal:AbortSignal.timeout(10000)});
 }catch{throw Error('Could not verify private workspace denial');}
 if(workspace.status!==403)
  throw Error('Private server workspace is not explicitly denied (HTTP '+workspace.status+')');
 return {status:'passed',companies:health.companies,sources:health.sources,
  supportedClaims:health.supportedClaims,exampleCompany:selected.id};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [origin]=process.argv.slice(2);
 probePublicResearch(origin||'').then(result=>{
  console.log('Public data deployment smoke passed',JSON.stringify(result));
 }).catch(err=>{console.error('Public data deployment smoke failed:',err.message);process.exitCode=1;});
}
