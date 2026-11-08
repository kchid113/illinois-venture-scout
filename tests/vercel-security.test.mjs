import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Next.js is the only app runtime and scheduled updates have a secure cron endpoint',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.scripts.build,'next build');
 for(const dep of ['wrangler','vinext','@cloudflare/vite-plugin','@cloudflare/workers-types'])assert.equal(pkg.dependencies?.[dep]||pkg.devDependencies?.[dep],undefined);
 const schedules=JSON.parse(read('vercel.json')).crons;
 assert.equal(schedules.length,12);
 assert.equal(new Set(schedules.map(x=>x.path)).size,12);
 assert.ok(schedules.every(x=>x.path.startsWith('/api/cron/refresh/')));
 assert.ok(!schedules.some(x=>/otm-startups/.test(x.path)));
 const cron=read('app/api/cron/refresh/[connector]/route.ts');
 assert.match(cron,/timingSafeEqual/);
 assert.match(cron,/CRON_SECRET/);
 assert.match(cron,/isScheduledConnector/);
 assert.match(cron,/executeScheduledConnector/);
});
test('private workspace requires authenticated Supabase identity and database RLS',()=>{
 const api=read('app/api/data/route.ts'),auth=read('lib/auth.ts'),migration=read('supabase/migrations/20261107000000_initial.sql');
 assert.match(api,/getInvestorUser\(\)/);
 assert.match(api,/\.from\('workspace'\)/);
 assert.match(api,/onConflict:'user_id,kind,key'/);
 assert.match(auth,/supabase\.auth\.getUser\(\)/);
 assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
 assert.match(migration,/user_id = \(SELECT auth\.uid\(\)\)/);
 assert.match(migration,/CREATE POLICY investor_workspace_insert/);
 assert.match(migration,/REVOKE ALL ON TABLE companies/);
});
test('credentials, admin roles and sign-ups are not controlled by client headers',()=>{
 const proxy=read('proxy.ts'),login=read('app/login/page.tsx'),admin=read('lib/admin.ts');
 assert.match(proxy,/auth\.getClaims\(\)/);
 assert.match(login,/shouldCreateUser:false/);
 assert.match(admin,/investor_roles/);
 assert.ok(!admin.includes('ADMIN_EMAIL')&&!admin.includes('oai-authenticated-user'));
 const config=read('.env.example');
 assert.match(config,/DATABASE_URL/);
 assert.doesNotMatch(config,/CLOUDFLARE|IVR_ACCESS_AUD|CHATGPT/);
});
test('obsolete infrastructure and unused UI boilerplate are not shipped',()=>{
 const pkg=JSON.parse(read('package.json'));
 for(const dep of ['@shadcn/react','recharts','@vitejs/plugin-rsc','json-rpc-2.0'])assert.equal(pkg.dependencies?.[dep]||pkg.devDependencies?.[dep],undefined);
 assert.match(read('components/radar.tsx'),/Founder contact/);
 assert.match(read('components/radar.tsx'),/auth\/signout/);
});
