/**
 * Run only on the disposable CI-local D1. Verifies that the actual Wrangler
 * migration + idempotent seed results agree with reviewed fixture counts.
 * This script makes no remote API requests and consumes no API token.
 */
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../data/import.json',import.meta.url),'utf8'));
const source=JSON.parse(readFileSync(new URL('../data/profile-evidence.json',import.meta.url),'utf8'));
const unique=new Set([...data,...source].map(x=>x.slug));
const query=[
 'SELECT',
 '(SELECT count(*) FROM companies) AS companies,',
 '(SELECT count(*) FROM claims) AS claims,',
 '(SELECT count(*) FROM sources) AS sources,',
 '(SELECT count(*) FROM workspace) AS private_items,',
 '(SELECT count(*) FROM source_candidates) AS pending_candidates,',
 '(SELECT count(*) FROM d1_migrations) AS applied_migrations'
].join(' ');
const result=spawnSync(process.execPath,[
 'node_modules/wrangler/bin/wrangler.js',
 'd1','execute','DB','--local',
 '--config','dist/server/wrangler.json',
 '--persist-to','.wrangler/state',
 '--command',query,'--json'
],{encoding:'utf8',timeout:25000,env:{...process.env,CLOUDFLARE_API_TOKEN:''}});
if(result.status!==0)throw Error('Local Wrangler D1 query failed after migrations and seed');
let rows;
try{
 const response=JSON.parse(result.stdout);
 if(!Array.isArray(response)||response.length!==1||response[0].success!==true||
    !Array.isArray(response[0].results))throw Error();
 rows=response[0].results;
}catch{throw Error('Local Wrangler D1 returned an unexpected response shape');}
const x=rows[0];
if(!x||x.companies!==unique.size||x.claims<100||x.sources<6||
   x.private_items!==0||x.pending_candidates!==0||x.applied_migrations!==2)
 throw Error('Reviewed D1 seed or versioned schema invariants failed');
console.log('Local D1 verified: '+x.companies+' reviewed companies, '+x.claims+
 ' evidenced claims, '+x.sources+' original sources, '+x.applied_migrations+
 ' migrations, no private workspaces or pending candidates');
