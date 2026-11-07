import postgres from 'postgres';

/**
 * Server-only Postgres adapter exposing the small statement API used by
 * source collectors and review logic. All statements run with native $n
 * parameters; multi-statement review batches are atomic transactions.
 */
let connection;
function client(){
 const url=process.env.DATABASE_URL;
 if(!url)throw Error('DATABASE_URL missing: configure a Supabase transaction pooler URL');
 if(!connection)connection=postgres(url,{
  max:1,prepare:false,ssl:url.includes('localhost')||url.includes('127.0.0.1')?false:'require',
  connect_timeout:15,idle_timeout:20
 });
 return connection;
}
export function parameterize(sql){
 if(typeof sql!=='string'||!sql.trim())throw Error('SQL statement required');
 let count=0,quoted=false,output='';
 for(let i=0;i<sql.length;i++){
  const c=sql[i];
  if(c==="'"){
   if(quoted&&sql[i+1]==="'"){output+="''";i++;continue;}
   quoted=!quoted;output+=c;continue;
  }
  if(c==='?'&&!quoted){output+='$'+(++count);continue;}
  output+=c;
 }
 if(quoted)throw Error('Unterminated SQL string');
 return {sql:output,count};
}
export function database(){
 const db=client();
 const statement=(query,bound=[])=>({
  _sql:query,_args:bound,
  bind(...values){return statement(query,values);},
  async all(){
   const compiled=parameterize(query);
   if(compiled.count!==bound.length)throw Error('SQL parameter mismatch');
   const rows=await db.unsafe(compiled.sql,bound);
   return {results:Array.from(rows)};
  },
  async run(){
   const compiled=parameterize(query);
   if(compiled.count!==bound.length)throw Error('SQL parameter mismatch');
   const result=await db.unsafe(compiled.sql,bound);
   return {meta:{changes:result.count||0},results:Array.from(result)};
  }
 });
 return {
  prepare:query=>statement(query),
  async batch(statements){
   return db.begin(async tx=>{
    const out=[];
    for(const item of statements){
     const compiled=parameterize(item._sql);
     if(compiled.count!==item._args.length)throw Error('SQL parameter mismatch');
     const res=await tx.unsafe(compiled.sql,item._args);
     out.push({meta:{changes:res.count||0},results:Array.from(res)});
    }
    return out;
   });
  }
 };
}
export async function all(sql,...values){return (await database().prepare(sql).bind(...values).all()).results;}
export async function closeDatabase(){if(connection){await connection.end();connection=null;}}
