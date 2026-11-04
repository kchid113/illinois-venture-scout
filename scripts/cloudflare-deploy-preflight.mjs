/**
 * Fail before any Cloudflare mutation unless account, Access and deployment
 * API token settings are present and structurally valid.
 */
const missing=[];
const env=process.env;
if(!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID||''))missing.push('CLOUDFLARE_ACCOUNT_ID (GitHub Actions variable)');
if(typeof env.CLOUDFLARE_API_TOKEN!=='string'||env.CLOUDFLARE_API_TOKEN.length<20)
 missing.push('CLOUDFLARE_API_TOKEN (GitHub Actions secret)');
if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.IVR_ACCESS_TEAM_DOMAIN||''))
 missing.push('IVR_ACCESS_TEAM_DOMAIN (GitHub Actions variable)');
if(!/^[A-Za-z0-9_-]{12,160}$/.test(env.IVR_ACCESS_AUD||''))
 missing.push('IVR_ACCESS_AUD (GitHub Actions variable)');
if(env.IVR_ADMIN_EMAIL&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.IVR_ADMIN_EMAIL))
 missing.push('IVR_ADMIN_EMAIL (valid email or empty)');
if(missing.length)throw Error('Deployment prerequisites missing or invalid: '+missing.join(', '));
console.log('Cloudflare account, token and Access policy variables are structurally configured');
