import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const load=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
function db(){
 const d=new DatabaseSync(':memory:');d.exec('PRAGMA foreign_keys=ON');
 d.exec(load('drizzle/0000_first_drax.sql'));
 d.exec(load('drizzle/0001_source_refresh.sql'));
 return d;
}
test('source refresh migration is registered in Drizzle journal in order',()=>{
 const journal=JSON.parse(load('drizzle/meta/_journal.json'));
 assert.deepEqual(journal.entries.map(e=>e.tag),['0000_first_drax','0001_source_refresh']);
 assert.deepEqual(journal.entries.map(e=>e.idx),[0,1]);
});
test('source refresh schema snapshot matches SQLite migration column names',()=>{
 const snapshot=JSON.parse(load('drizzle/meta/0001_snapshot.json'));
 const d=db();
 for(const table of ['source_candidates','refresh_leases']){
  const actual=d.prepare('PRAGMA table_info('+table+')').all().map(x=>x.name).sort();
  const declared=Object.keys(snapshot.tables[table]?.columns||{}).sort();
  assert.deepEqual(actual,declared,table);
 }
 d.close();
});
test('candidate review database enforces foreign keys, status trigger and required indexes',()=>{
 const d=db();
 const indexes=d.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='source_candidates'").all().map(r=>r.name);
 for(const i of ['candidate_status_idx','candidate_company_idx','candidate_connector_idx'])assert.ok(indexes.includes(i),i);
 assert.ok(d.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='source_candidate_decision_once'").get());
 const links=d.prepare('PRAGMA foreign_key_list(source_candidates)').all();
 assert.ok(links.some(x=>x.table==='companies'&&x.from==='company_id'));
 d.close();
});
test('all source candidate review decisions have a unique ID and consistent terminal statuses',()=>{
 const d=db();
 const record={id:'a'.repeat(64),connector:'iventure-cohorts',external_id:'x',source_url:'https://iventure.illinois.edu/startups',
  publisher:'iVenture Accelerator',title:'Venture',excerpt:'Listed',observed_at:'2026-11-03T12:00:00Z',last_checked:'2026-11-03T12:00:00Z',content_hash:'b'.repeat(64)};
 const insert=d.prepare('INSERT INTO source_candidates(id,connector,external_id,source_url,publisher,title,excerpt,observed_at,last_checked,content_hash) VALUES(?,?,?,?,?,?,?,?,?,?)');
 const values=['id','connector','external_id','source_url','publisher','title','excerpt','observed_at','last_checked','content_hash'].map(x=>record[x]);
 insert.run(...values);
 assert.throws(()=>insert.run(...values),/UNIQUE/);
 assert.equal(d.prepare('SELECT status FROM source_candidates').get().status,'Pending');
 d.prepare("UPDATE source_candidates SET status='Rejected' WHERE id=?").run(record.id);
 assert.throws(()=>d.prepare("UPDATE source_candidates SET status='Approved' WHERE id=?").run(record.id),/pending/i);
 assert.equal(d.prepare('SELECT status FROM source_candidates').get().status,'Rejected');
 d.close();
});
test('existing user research and company records remain compatible after additive migration',()=>{
 const d=db();
 const records=JSON.parse(load('data/import.json'));
 d.exec(load('data/seed.sql'));
 assert.equal(d.prepare('SELECT count(*) n FROM companies').get().n,records.length);
 assert.equal(d.prepare('SELECT count(*) n FROM workspace').get().n,0);
 assert.equal(d.prepare('SELECT count(*) n FROM source_candidates').get().n,0);
 const fields=d.prepare('PRAGMA table_info(claims)').all().map(x=>x.name);
 assert.ok(fields.includes('classification')&&fields.includes('status'));
 d.close();
});
