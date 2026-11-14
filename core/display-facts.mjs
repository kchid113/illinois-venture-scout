/**
 * Presentation-only omission of missing research values.
 * Zero and actual negative findings remain visible when supported.
 * This never changes stored claims, status, citations, or audit history.
 */
export function hasDisplayValue(value){
 if(typeof value!=='string')return false;
 const v=value.trim();
 if(!v)return false;
 const simplified=v.toLowerCase().replace(/\s+/g,' ').replace(/[.]+$/,'');
 return !new Set([
  '-', '—','–','n/a','na','null','undefined','unknown','not known',
  'not recorded','not available','not yet verified','not provided',
  'data not available','no data','pending','tbd','to be confirmed'
 ]).has(simplified);
}

export function displayableClaims(claims,fields){
 const allowed=new Set(fields.map(f=>f.toLowerCase()));
 return (claims||[]).filter(c=>allowed.has(String(c.field||'').toLowerCase())&&hasDisplayValue(c.value));
}

export function firstDisplayableClaim(claims,fields){
 return displayableClaims(claims,fields)[0]||null;
}
