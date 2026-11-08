import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('public app uses Next.js and scheduled updates have a secret-protected endpoint',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.scripts.build,'next build');
 for(const dep of ['wrangler','vinext','@cloudflare/vite-plugin','@cloudflare/workers-types'])
  assert.equal(pkg.dependencies?.[dep]||pkg.devDependencies?.[dep],undefined);
 const schedules=JSON.parse(read('vercel.json')).crons;
 assert.equal(schedules.length,12);
 assert.equal(new Set(schedules.map(x=>x.path)).size,12);
 assert.ok(schedules.every(x=>x.path.startsWith('/api/cron/refresh/')));
 assert.ok(!schedules.some(x=>/otm-startups/.test(x.path)));
 const cron=read('app/api/cron/refresh/[connector]/route.ts');
 assert.match(cron,/timingSafeEqual/);
 assert.match(cron,/CRON_SECRET/);
 assert.match(cron,/isScheduledConnector/);
});

test('anonymous read-only source endpoints do not expose private account workspace',()=>{
 const api=read('app/api/data/route.ts');
 assert.match(api,/export async function GET/);
 assert.doesNotMatch(api,/getInvestorUser\(\)|\.from\('workspace'\)/);
 assert.match(api,/view==='company'/);
 assert.match(api,/view==='sources'/);
 assert.match(api,/view==='workspace'.*status:403/);
 assert.match(api,/export async function POST/);
 assert.match(api,/Server-side personal workspace writes are disabled/);
 assert.match(api,/jobs:\[\]/);
 assert.equal(existsSync(new URL('../proxy.ts',import.meta.url)),false);
 for(const path of ['app/login/page.tsx','app/auth/callback/page.tsx'])
  assert.match(read(path),/redirect\('\/'\)/);
});

test('public research is browser-local, admin and legacy workspace stay protected',()=>{
 const ui=read('components/radar.tsx');
 const storage=read('core/local-workspace.mjs');
 const admin=read('lib/admin.ts');
 const migration=read('supabase/migrations/20261107000000_initial.sql');
 assert.match(ui,/localStorage/);
 assert.match(ui,/decodeLocalWorkspace/);
 assert.match(ui,/encodeLocalWorkspace/);
 assert.match(ui,/Export research backup/);
 assert.match(ui,/Import a browser research backup/);
 assert.doesNotMatch(ui,/auth\/signout|\/api\/data\?view=workspace/);
 assert.match(storage,/ivr-public-workspace-v1/);
 assert.match(admin,/getInvestorUser/);
 assert.match(admin,/investor_roles/);
 assert.match(read('app/api/admin/route.ts'),/if\(!await isAdmin\(\)\)/);
 assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
 assert.match(migration,/user_id = \(SELECT auth\.uid\(\)\)/);
 assert.match(migration,/CREATE POLICY investor_workspace_insert/);
 assert.match(migration,/REVOKE ALL ON TABLE companies/);
});

test('secrets are not leaked to the client and obsolete stacks are absent',()=>{
 const config=read('.env.example');
 assert.match(config,/DATABASE_URL/);
 assert.match(config,/CRON_SECRET/);
 assert.doesNotMatch(config,/CLOUDFLARE|IVR_ACCESS_AUD|CHATGPT/);
 assert.match(read('components/radar.tsx'),/Founder contact/);
 const pkg=JSON.parse(read('package.json'));
 for(const dep of ['@shadcn/react','recharts','@vitejs/plugin-rsc','json-rpc-2.0'])
  assert.equal(pkg.dependencies?.[dep]||pkg.devDependencies?.[dep],undefined);
});
