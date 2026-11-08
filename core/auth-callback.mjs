/** Parse Supabase callbacks without logging or retaining bearer tokens in diagnostics.
 * The hosted default {{ .ConfirmationURL }} can return an implicit session
 * fragment; server route handlers cannot see it. PKCE codes and token hashes
 * are supported as well. This parser is deliberately dependency-free for CI.
 */
/**
 * @typedef {{kind:'error',reason:'expired'|'rejected'} |
 *           {kind:'code',code:string} |
 *           {kind:'token-hash',tokenHash:string,type:'email'|'invite'} |
 *           {kind:'implicit-session',accessToken:string,refreshToken:string} |
 *           {kind:'existing-session'}} AuthCallback
 * @param {string} href
 * @returns {AuthCallback}
 */
export function classifyAuthCallback(href){
 const url=new URL(href,'https://example.invalid');
 const query=url.searchParams;
 const fragment=new URLSearchParams(url.hash.replace(/^#/,''));
 if(query.has('error')||fragment.has('error')){
  const reason=query.get('error_code')||fragment.get('error_code')||'';
  return {kind:'error',reason:reason==='otp_expired'?'expired':'rejected'};
 }
 const code=query.get('code');
 if(code)return {kind:'code',code};
 const tokenHash=query.get('token_hash'),type=query.get('type');
 if(tokenHash&&(type==='email'||type==='invite'))
  return {kind:'token-hash',tokenHash,type};
 const accessToken=fragment.get('access_token'),refreshToken=fragment.get('refresh_token');
 if(accessToken&&refreshToken)
  return {kind:'implicit-session',accessToken,refreshToken};
 return {kind:'existing-session'};
}
