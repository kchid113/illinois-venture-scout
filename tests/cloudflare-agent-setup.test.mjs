import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const remote='https://mcp.cloudflare.com/mcp';

test('Cloudflare MCP is configured for Copilot, VS Code and Cursor with their correct schemas',()=>{
 const portable=JSON.parse(read('.mcp.json'));
 const cursor=JSON.parse(read('.cursor/mcp.json'));
 const vscode=JSON.parse(read('.vscode/mcp.json'));
 assert.deepEqual(portable,{mcpServers:{cloudflare:{url:remote}}});
 assert.deepEqual(cursor,{mcpServers:{cloudflare:{url:remote}}});
 assert.deepEqual(vscode,{servers:{cloudflare:{type:'http',url:remote}}});
});

test('Cloudflare MCP project configs never contain authentication credentials or startup auto-execution',()=>{
 for(const path of ['.mcp.json','.cursor/mcp.json','.vscode/mcp.json']){
  const raw=read(path);
  assert.doesNotMatch(raw,/api_token|client_secret|access_token|password|refresh_token/i);
  assert.doesNotMatch(raw,/command|args|npm|npx|bash|sh -c/i);
  assert.equal((raw.match(/mcp\.cloudflare\.com/g)||[]).length,1);
 }
});

test('agent guidance respects existing safe production deployment boundaries',()=>{
 const text=read('AGENTS.md')+'\n'+read('docs/cloudflare-agent-setup.md');
 for(const item of [
  'cloudflare-deploy.yml','cloudflareaccess.com','IVR_ACCESS_AUD',
  'CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN','import_source_catalog',
  'create_d1','https://developers.cloudflare.com/agent-setup/prompt.md'
 ])assert.ok(text.includes(item),item);
 assert.match(text,/OAuth/);
 assert.match(text,/not deployed|not.*deploy/i);
});
