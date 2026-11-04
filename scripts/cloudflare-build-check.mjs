/**
 * Verify that the standalone Vite build actually emitted a Worker with the
 * expected D1 database and Access policy, not the managed Sites placeholder.
 */
import {readFile,readdir,access,appendFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const expectedId=process.env.IVR_CLOUDFLARE_D1_ID;
const expectedTeam=process.env.IVR_ACCESS_TEAM_DOMAIN;
const expectedAud=process.env.IVR_ACCESS_AUD;
async function paths(dir,level=0){
 if(level>4)return [];
 let entries;
 try{entries=await readdir(dir,{withFileTypes:true});}catch{return [];}
 const out=[];
 for(const e of entries){
  const file=path.join(dir,e.name);
  if(e.isFile()&&e.name==='wrangler.json')out.push(file);
  if(e.isDirectory()&&e.name!=='node_modules')out.push(...await paths(file,level+1));
 }
 return out;
}
const found=[];
for(const file of await paths(path.join(root,'dist'))){
 let body;
 try{body=JSON.parse(await readFile(file,'utf8'));}catch{continue;}
 if(body?.name==='illinois-venture-radar')found.push({file,body});
}
if(found.length!==1)throw Error('Expected exactly one standalone Cloudflare Worker manifest');
const {file,body}=found[0];
const dbs=body.d1_databases;
if(!Array.isArray(dbs)||dbs.length!==1||dbs[0].binding!=='DB'||
 dbs[0].database_name!=='illinois-venture-radar'||
 dbs[0].database_id!==expectedId||dbs[0].database_id.startsWith('00000000-')||
 body.vars?.IVR_ACCESS_TEAM_DOMAIN!==expectedTeam||body.vars?.IVR_ACCESS_AUD!==expectedAud)
 throw Error('Cloudflare Worker manifest does not match intended database and Access policy');
if(typeof body.main!=='string'||!body.main||path.isAbsolute(body.main)||
 typeof dbs[0].migrations_dir!=='string')throw Error('Invalid Worker entry or migration directory');
try{
 await access(path.resolve(path.dirname(file),body.main));
 await access(path.resolve(path.dirname(file),dbs[0].migrations_dir,'0000_first_drax.sql'));
 await access(path.resolve(path.dirname(file),dbs[0].migrations_dir,'0001_source_refresh.sql'));
}catch{throw Error('Cloudflare Worker entrypoint or versioned migrations not present');}
if(process.env.GITHUB_ENV)await appendFile(process.env.GITHUB_ENV,
 'IVR_WORKER_CONFIG='+path.relative(root,file)+'\n');
console.log('Standalone Cloudflare Worker manifest and D1/Access bindings verified');
