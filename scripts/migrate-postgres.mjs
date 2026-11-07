import {readFile} from 'node:fs/promises';
import postgres from 'postgres';

const url=process.env.DATABASE_URL;
if(!url)throw Error('DATABASE_URL required');
const sql=postgres(url,{max:1,prepare:false,ssl:/localhost|127\.0\.0\.1/.test(url)?false:'require'});
try{
 const migration=await readFile(new URL('../supabase/migrations/20261107000000_initial.sql',import.meta.url),'utf8');
 // The SQL is fixed, reviewed, local repository text, never user input.
 await sql.unsafe(migration);
 console.log('PostgreSQL schema, candidate review trigger and workspace RLS are installed.');
}finally{await sql.end();}
