import {readFile,writeFile} from 'node:fs/promises';
const r=JSON.parse(await readFile('data/import.json','utf8'));
for(const x of r){x.description=x.description.replace(/^(?:(?:Facebook|Instagram|X-twitter|Threads|Linkedin)\s*)+/i,'').replace(/^[,\s]*(?:Champaign,?\s*IL(?:\s*61820)?)[,\s]*/i,'');x.sector=x.sector?.split(' · ').filter(s=>!/^\d/.test(s)).join(' · ')||null;}
await writeFile('data/import.json',JSON.stringify(r,null,2));
