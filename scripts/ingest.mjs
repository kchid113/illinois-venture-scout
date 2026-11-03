import {collectDirectory} from '../core/ingestion.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
await mkdir('data',{recursive:true});
const records=await collectDirectory({pages:Number(process.argv[2]||3),onPage:r=>console.log(`Retrieved ${r.length} eligible startup records`)});
await writeFile('data/import.json',JSON.stringify(records,null,2));
console.log(`Saved ${records.length} source-backed records. Review before import using npm run seed.`);
