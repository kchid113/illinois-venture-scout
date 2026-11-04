/**
 * Build an importable one-file D1 batch from reviewed, repository-tracked
 * catalog SQL. Cloudflare D1 manages transaction boundaries on SQL imports:
 * explicit BEGIN/COMMIT wrappers are not permitted in Wrangler import files.
 *
 * This script NEVER calls a production API. It only prepares/validates SQL.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const DATA_FILES=Object.freeze([
 'data/live-source-research-park-import.sql',
 'data/live-source-candidates.sql'
]);
export function stripSQLiteTransaction(sql,{kind}={}){
 if(typeof sql!=='string'||!['companies','candidates'].includes(kind))
  throw Error('Invalid catalog import input');
 const lines=sql.replace(/\r\n/g,'\n').split('\n');
 const output=[],transactions=[];
 for(const row of lines){
  const s=row.trim();
  if(s==='BEGIN TRANSACTION;'||s==='COMMIT;'){
   transactions.push(s);
   continue;
  }
  if(!s||s.startsWith('--')){output.push(row);continue;}
  if(s.startsWith('BEGIN ')||s.startsWith('COMMIT')||
   s.startsWith('SAVEPOINT')||s.startsWith('ROLLBACK'))
   throw Error('Nested or non-canonical SQL transaction in catalog');
  if(kind==='candidates'&&!s.startsWith('INSERT INTO source_candidates('))
   throw Error('Candidate import contains unexpected statement');
  if(kind==='companies'&&!(
   s.startsWith('INSERT INTO companies(')||
   s.startsWith('INSERT INTO sources(')||
   s.startsWith('INSERT OR IGNORE INTO source_history(')||
   s.startsWith('INSERT OR IGNORE INTO claims(')||
   s.startsWith('INSERT INTO evidence(')||
   s.startsWith('INSERT OR IGNORE INTO affiliations(')||
   s.startsWith("UPDATE claims SET status='Conflicting' WHERE")))
   throw Error('Research Park import contains unexpected statement');
  output.push(row);
 }
 if(transactions.length&&!(
  transactions.length===2&&transactions[0]==='BEGIN TRANSACTION;'&&transactions[1]==='COMMIT;'
 ))throw Error('Unbalanced transaction wrappers');
 const joined=output.join('\n');
 const statements=output.filter(x=>x.trim()&&!x.trim().startsWith('--')).length;
 if(!statements)throw Error('Catalog has no eligible statements');
 return {sql:joined,statements};
}
export function buildD1CatalogFile({companies,candidates,manifest}){
 if(!manifest||manifest.schemaVersion!==1||!Array.isArray(manifest.sourceChecks)||
  !manifest.collection||!Number.isInteger(manifest.collection.additionalResearchParkImportable)||
  !Number.isInteger(manifest.collection.distinctCandidates))
  throw Error('Missing validated live source manifest');
 const research=stripSQLiteTransaction(companies,{kind:'companies'});
 const pending=stripSQLiteTransaction(candidates,{kind:'candidates'});
 const expected=manifest.collection.distinctCandidates;
 if(pending.statements!==expected)
  throw Error('Candidate SQL count differs from verified source manifest');
 if(research.statements<manifest.collection.additionalResearchParkImportable)
  throw Error('Research Park additions do not match manifest');
 if(manifest.sourceIdentityConflicts?.length)
  throw Error('Unresolved Research Park source identity conflicts');
 return {
  sql:'-- Single Cloudflare D1 import batch; already validated in SQLite.\n'+
   '-- New canonical Research Park rows followed by PENDING source observations.\n'+
   research.sql+'\n'+pending.sql+'\n',
  companyStatementCount:research.statements,
  candidateCount:pending.statements
 };
}
const invoked=process.argv[1]&&
 path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 const [companies,candidates,manifest]=await Promise.all([
  readFile(DATA_FILES[0],'utf8'),readFile(DATA_FILES[1],'utf8'),
  readFile('data/live-source-catalog.json','utf8').then(JSON.parse)
 ]);
 const batch=buildD1CatalogFile({companies,candidates,manifest});
 const destination='.catalog-import-d1.sql';
 await writeFile(destination,batch.sql,{flag:'w',mode:0o600});
 console.log('Prepared Cloudflare D1 catalog import: '+batch.companyStatementCount+
  ' directory SQL statements and '+batch.candidateCount+' pending observations; no remote changes');
}
