import {readFile,writeFile} from 'node:fs/promises';
import {recordStatements} from '../core/records.mjs';
import {assertProductionSeeds} from '../core/production-integrity.mjs';
const records=JSON.parse(await readFile('data/import.json','utf8'));let sql='';
const profiles=JSON.parse(await readFile('data/profile-evidence.json','utf8'));
const audited=assertProductionSeeds(records,profiles);
for(const r of [...records,...profiles])for(const op of await recordStatements(r)){let i=0;sql+=op.sql.replace(/\?/g,()=>op.values[i]==null?(i++,'NULL'):"'"+String(op.values[i++]).replaceAll("'","''")+"'")+';\n';}
sql+=`INSERT OR IGNORE INTO ingestion_jobs(id,connector,status,started_at,finished_at,count,message) VALUES('initial-import','Research Park','Succeeded','${records[0].retrievedAt}','${new Date().toISOString()}',${records.length},'Reviewed directory import; descriptions are reported statements');\n`;
await writeFile('data/seed.sql',sql);console.log(`Prepared ${audited.companies} reviewed companies and ${audited.reviewedProfiles} linked profiles for idempotent database import`);
