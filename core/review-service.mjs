import {approvalStatements,newIVentureCompany,newEnterpriseWorksCompany,normalizeCompanyName} from './source-candidates.mjs';
import {publicVentureWebsite,trustedOfficialProfile} from './source-security.mjs';

/** A typed policy error keeps HTTP status mapping out of business rules. */
export class ReviewError extends Error {
 constructor(message,status=409){super(message);this.name='ReviewError';this.status=status;}
}
const rows=async(db,query,...args)=>(await db.prepare(query).bind(...args).all()).results;
const statements=(db,ops)=>db.batch(ops.map(op=>db.prepare(op.sql).bind(...op.values)));
function verifyIdentity(candidate,known){
 const found=known.filter(company=>company.id===candidate.company_id);
 if(found.length!==1||found[0].name!==candidate.company_name)
  throw new ReviewError('Candidate identity no longer matches an existing company',409);
}
function requireUniqueNewVenture(row,known,profile){
 const name=normalizeCompanyName(row.company_name);
 if(!name||known.some(c=>normalizeCompanyName(c.name)===name))
  throw new ReviewError('The venture name already exists or cannot be verified uniquely',409);
 if(known.some(c=>c.profile===profile))
  throw new ReviewError('The venture profile URL is already used by another company',409);
}
/** Called ONLY behind the existing administrator-authenticated route.
 *
 * A D1 batch is atomic; its first statement executes a guarded terminal
 * status transition. A SQL trigger rejects the second decision even if two
 * reviewers read the same Pending row before either one writes. Subsequent
 * company, source, evidence and audit writes then commit or roll back together.
 */
export async function decideSourceCandidate(db,{id,decision,actor='administrator',now=new Date().toISOString()}){
 if(!/^[a-f0-9]{64}$/.test(String(id))||!['approve','reject','create'].includes(decision))
  throw new ReviewError('Invalid candidate review request',400);
 const candidates=await rows(db,'SELECT * FROM source_candidates WHERE id=?',id);
 if(candidates.length!==1||candidates[0].status!=='Pending')
  throw new ReviewError('Candidate is not pending',409);
 const candidate=candidates[0],existing=await rows(db,'SELECT id,name,profile FROM companies');
 let companyId=candidate.company_id,createOp=null;
 if(decision==='approve'){
  if(!companyId)throw new ReviewError('An exact company match is required before approval',422);
  verifyIdentity(candidate,existing);
 }else if(decision==='create'){
  if(companyId||!['iventure-cohorts','enterpriseworks-directory'].includes(candidate.connector))
   throw new ReviewError('Only unmatched official cohort/incubator records can create ventures',422);
  let planned;
  try{planned=candidate.connector==='iventure-cohorts'?
   await newIVentureCompany(candidate,now):await newEnterpriseWorksCompany(candidate,now);
  }catch(e){throw new ReviewError(String(e instanceof Error?e.message:e),422);}
  const profile=planned.statement.values[2];
  if(candidate.connector==='iventure-cohorts')publicVentureWebsite(profile);
  else trustedOfficialProfile(profile);
  requireUniqueNewVenture(candidate,existing,profile);
  if(existing.some(c=>c.id===planned.companyId))throw new ReviewError('Generated company ID already exists',409);
  companyId=planned.companyId;createOp=planned.statement;
 }
 const ops=[
  // Do not include "AND status='Pending'": the SQL trigger must abort a
  // competing review in the same transaction, rather than update zero rows.
  {sql:'UPDATE source_candidates SET status=?, company_id=COALESCE(?,company_id) WHERE id=?',values:[decision==='reject'?'Rejected':'Approved',companyId,id]}
 ];
 if(createOp)ops.push(createOp);
 if(decision!=='reject')ops.push(...await approvalStatements({...candidate,company_id:companyId},now));
 ops.push({sql:'INSERT INTO audit(id,actor,action,target,created_at) VALUES(?,?,?,?,?)',values:[crypto.randomUUID(),actor,'candidate-'+decision,id,now]});
 try{await statements(db,ops);}
 catch(e){throw new ReviewError('Review transaction failed: '+String(e instanceof Error?e.message:e).slice(0,160),409);}
 return {ok:true,status:decision==='reject'?'Rejected':'Approved',companyId};
}
