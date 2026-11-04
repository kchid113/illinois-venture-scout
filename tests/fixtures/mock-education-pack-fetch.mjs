/* Test-only transport: no requests leave the Node test process. */
globalThis.fetch=async(url,opts={})=>{
 const u=new URL(String(url));
 if(u.hostname==='venture.example.org'&&u.pathname==='/api/admin/refresh'){
  if(opts.method!=='POST'||opts.redirect!=='error')throw Error('Invalid protected refresh request');
  const data=JSON.parse(String(opts.body||'{}'));
  process.stdout.write('MOCK_SOURCE '+data.connector+'\n');
  if(process.env.IVR_TEST_FAIL_CONNECTOR===data.connector)
   return new Response(JSON.stringify({error:'source temporarily unavailable'}),{status:502});
  return new Response(JSON.stringify({connector:data.connector,jobId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',observed:2,imported:0,staged:1,deferred:0}),{status:200});
 }
 if(['api.honeybadger.io','eu-api.honeybadger.io'].includes(u.hostname)){
  if(opts.method!=='GET'||opts.redirect!=='error'||opts.body)throw Error('Invalid monitoring request');
  process.stdout.write('MOCK_CHECKIN\n');
  return new Response('ok',{status:process.env.IVR_TEST_FAIL_CHECKIN==='true'?503:200});
 }
 throw Error('Unexpected outbound integration request');
};
