import {browserstackConfig,runBrowserstackSmoke} from '../core/education-browserstack.mjs';

if(process.env.IVR_BROWSERSTACK_ENABLED!=='true'){
 console.log('BrowserStack smoke disabled; enable it after configuring your Student Pack account.');
 process.exit(0);
}
const config=browserstackConfig(process.env);
const result=await runBrowserstackSmoke(config);
if(!result.ok)throw Error('BrowserStack smoke failed');
console.log('BrowserStack mobile public-entry smoke passed');
