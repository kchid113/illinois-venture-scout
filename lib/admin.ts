import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export async function isAdmin(request?:Request){const config=env as Cloudflare.Env & {ADMIN_TOKEN?:string;ADMIN_EMAIL?:string};if(request&&config.ADMIN_TOKEN&&config.ADMIN_TOKEN.length>=32&&request.headers.get('authorization')===`Bearer ${config.ADMIN_TOKEN}`)return true;const user=await getChatGPTUser();return !!user&&!!config.ADMIN_EMAIL&&user.email.toLowerCase()===config.ADMIN_EMAIL.toLowerCase();}
