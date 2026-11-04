/**
 * Standalone Cloudflare deployment. The existing vite.config.ts intentionally
 * remains the managed ChatGPT Sites/preview configuration.
 *
 * Build with pnpm exec vite build --config vite.cloudflare.config.ts.
 * Never deploy the generated Sites placeholder database binding.
 */
import vinext from 'vinext';
import {defineConfig} from 'vite';

const DATABASE=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TEAM=/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/;
const AUD=/^[A-Za-z0-9_-]{12,160}$/;

export default defineConfig(async()=>{
 const databaseId=process.env.IVR_CLOUDFLARE_D1_ID||'';
 const teamDomain=process.env.IVR_ACCESS_TEAM_DOMAIN||'';
 const audience=process.env.IVR_ACCESS_AUD||'';
 if(!DATABASE.test(databaseId)||!TEAM.test(teamDomain)||!AUD.test(audience)){
  throw Error('Cloudflare deployment configuration incomplete: check D1 ID and Access team/audience variables');
 }
 const {cloudflare}=await import('@cloudflare/vite-plugin');
 return {
  plugins:[
   vinext(),
   cloudflare({
    viteEnvironment:{name:'rsc',childEnvironments:['ssr']},
    inspectorPort:false,
    config:{
     name:'illinois-venture-radar',
     main:'./worker/cloudflare-index.ts',
     compatibility_date:'2026-05-15',
     compatibility_flags:['nodejs_compat'],
     d1_databases:[{
      binding:'DB',database_name:'illinois-venture-radar',
      database_id:databaseId,
      migrations_dir:'../../drizzle'
     }],
     vars:{
      IVR_ACCESS_TEAM_DOMAIN:teamDomain,
      IVR_ACCESS_AUD:audience,
      ...(process.env.IVR_ADMIN_EMAIL?{ADMIN_EMAIL:process.env.IVR_ADMIN_EMAIL}:{})
     }
    }
   })
  ]
 };
});
