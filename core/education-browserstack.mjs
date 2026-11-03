import {publicVentureWebsite} from './source-security.mjs';

/** Dependency-free W3C WebDriver client for BrowserStack mobile entry smoke. */
const HUB='https://hub-cloud.browserstack.com/wd/hub';
const SESSION=/^[A-Za-z0-9_-]{4,200}$/;
export function browserstackConfig(env){
 const username=env.IVR_BROWSERSTACK_USERNAME,accessKey=env.IVR_BROWSERSTACK_ACCESS_KEY;
 if(typeof username!=='string'||!username||typeof accessKey!=='string'||accessKey.length<10)
  throw Error('BrowserStack username/access key must be configured as GitHub Secrets');
 let target;
 try{target=new URL(publicVentureWebsite(env.IVR_BROWSERSTACK_SITE_URL));}
 catch{throw Error('BrowserStack target must be a public HTTPS site origin');}
 if(target.pathname!=='/'||target.search||target.hash||target.port)
  throw Error('BrowserStack target must be the site origin, not a company or private path');
 const device=env.IVR_BROWSERSTACK_DEVICE||'Samsung Galaxy S20';
 const osVersion=env.IVR_BROWSERSTACK_OS_VERSION||'10.0';
 if(!/^[A-Za-z0-9 .+()_-]{3,80}$/.test(device)||!/^\d{1,2}(?:\.\d{1,2})?$/.test(osVersion))
  throw Error('Invalid BrowserStack mobile device configuration');
 const buildName=String(env.GITHUB_SHA||'patch-4').slice(0,40).replace(/[^A-Za-z0-9_-]/g,'');
 return {username,accessKey,target:target.href,device,osVersion,buildName};
}
export function browserstackCapabilities(config){
 return {alwaysMatch:{
  browserName:'Chrome',
  'bstack:options':{
   osVersion:config.osVersion,deviceName:config.device,realMobile:'true',
   projectName:'Illinois Venture Radar',buildName:config.buildName,
   sessionName:'Public entry and sign-in smoke'
  }
 }};
}
async function webdriver(fetcher,config,method,path,data){
 let response;
 try{
  response=await fetcher(HUB+path,{
   method,redirect:'error',
   headers:{
    Authorization:'Basic '+Buffer.from(config.username+':'+config.accessKey).toString('base64'),
    Accept:'application/json','Content-Type':'application/json'
   },
   ...(data==null?{}:{body:JSON.stringify(data)}),
   signal:AbortSignal.timeout(30000)
  });
 }catch{throw Error('BrowserStack WebDriver transport failed');}
 if(!response.ok)throw Error('BrowserStack WebDriver rejected the request (HTTP '+response.status+')');
 let payload;
 try{payload=await response.json();}
 catch{throw Error('BrowserStack returned an invalid WebDriver response');}
 if(payload?.value?.error)throw Error('BrowserStack WebDriver returned an error');
 return payload;
}
export async function runBrowserstackSmoke(config,{fetcher=fetch}={}){
 const create=await webdriver(fetcher,config,'POST','/session',{
  capabilities:browserstackCapabilities(config)
 });
 const session=create?.value?.sessionId||create?.sessionId;
 if(typeof session!=='string'||!SESSION.test(session))throw Error('BrowserStack did not return a valid session');
 const path='/session/'+session;
 try{
  await webdriver(fetcher,config,'POST',path+'/url',{url:config.target});
  const result=await webdriver(fetcher,config,'POST',path+'/execute/sync',{
   script:"return {ready:document.readyState,body:!!document.body,validEntry:/Illinois Venture Radar|Sign in with ChatGPT|Sign in to ChatGPT/i.test(document.title+' '+(document.body?.innerText||'').slice(0,1000))};",
   args:[]
  });
  const state=result?.value;
  if(!state||!state.body||!state.validEntry||state.ready!=='complete')
   throw Error('BrowserStack public entry/sign-in smoke failed');
  return {ok:true,checked:'public-entry'};
 }finally{
  try{await webdriver(fetcher,config,'DELETE',path,null);}
  catch{/* Session cleanup failure never hides a failed app smoke. */}
 }
}
