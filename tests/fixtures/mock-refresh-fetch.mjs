/* Only loaded into a child process of the CLI test. No live network access. */
globalThis.fetch=async(url,options={})=>{
 const endpoint=new URL(String(url)),payload=JSON.parse(String(options.body||'{}'));
 const expected='Bearer '+String(process.env.IVR_ADMIN_TOKEN);
 if(endpoint.pathname!=='/api/admin/refresh'||options.method!=='POST'||options.redirect!=='error'||
    options.headers?.Authorization!==expected||!payload.connector)
  throw Error('Invalid refresh request construction');
 if(process.env.IVR_TEST_EXPECT_SERVICE_TOKEN&&options.headers?.['OAI-Sites-Authorization']!==process.env.IVR_TEST_EXPECT_SERVICE_TOKEN)
  throw Error('Missing Sites service authentication');
 // Print only connector and path, never credentials.
 process.stdout.write('MOCK_REFRESH '+JSON.stringify({path:endpoint.pathname,connector:payload.connector})+'\n');
 if(process.env.IVR_TEST_FAIL_CONNECTOR===payload.connector)
  return new Response(JSON.stringify({error:'Upstream source unavailable'}),{status:503,headers:{'Content-Type':'application/json'}});
 return new Response(JSON.stringify({connector:payload.connector,jobId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',observed:3,imported:1,staged:2,deferred:0}),{status:200,headers:{'Content-Type':'application/json'}});
};
