globalThis.fetch=async(url,options={})=>{
 if(String(url)!=='https://api.browserstack.com/automate/plan.json'||options.method!=='GET'||options.redirect!=='error')
  throw Error('Unexpected provider request');
 return new Response(JSON.stringify({automate_plan:'Automate Mobile',parallel_sessions_max_allowed:1}));
};
