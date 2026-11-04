import {appendFile} from 'node:fs/promises';
import {provisionD1} from '../core/cloudflare-d1-provision.mjs';

/** Explicit GitHub Action only. Never write API token to logs or disk. */
const result=await provisionD1({
 accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
 token:process.env.CLOUDFLARE_API_TOKEN,
 allowCreate:process.env.IVR_ALLOW_CREATE_D1==='true'
});
const envFile=process.env.GITHUB_ENV;
if(typeof envFile!=='string'||!envFile)throw Error('GitHub Actions environment is required');
await appendFile(envFile,'IVR_CLOUDFLARE_D1_ID='+result.databaseId+'\n');
if(process.env.GITHUB_OUTPUT)
 await appendFile(process.env.GITHUB_OUTPUT,'created='+String(result.created)+'\n');
console.log(result.created?'New dedicated Cloudflare D1 created':'Existing dedicated Cloudflare D1 selected');
