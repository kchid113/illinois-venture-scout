/**
 * Assemble source-backed claim records in memory after two bounded SQL reads.
 * Preserves query order and all linked evidence (including contradictions) without
 * one database round-trip per company or per claim.
 */
export function indexCompanyClaims(companyIds,claimRows,evidenceRows){
 const groups=new Map(companyIds.map(id=>[String(id),[]]));
 const evidenceByClaim=new Map();
 for(const e of evidenceRows){
  const id=String(e.claim_id);
  if(!evidenceByClaim.has(id))evidenceByClaim.set(id,[]);
  evidenceByClaim.get(id).push(e);
 }
 for(const claim of claimRows){
  const companyId=String(claim.company_id);
  if(!groups.has(companyId))continue;
  groups.get(companyId).push({...claim,id:String(claim.id),evidence:evidenceByClaim.get(String(claim.id))||[]});
 }
 return groups;
}
