import {honeybadgerCheckinUrl} from './education-monitoring.mjs';
import {browserstackCredentials,verifyBrowserstackPlan} from './education-browserstack.mjs';

const NAMES=Object.freeze([
 'IVR_HONEYBADGER_CHECKIN_URL',
 'IVR_BROWSERSTACK_USERNAME',
 'IVR_BROWSERSTACK_ACCESS_KEY',
 'CODECOV_TOKEN'
]);

/**
 * Validate that GitHub Actions Secret bindings have meaningful shapes.
 * Secret contents, even a check-in URL, must never be returned or logged.
 */
export function validateEducationSecrets(env){
 const absent=NAMES.filter(k=>typeof env[k]!=='string'||env[k].length===0);
 if(absent.length)throw Error('GitHub Actions Secrets missing: '+absent.join(', '));
 try{honeybadgerCheckinUrl(env.IVR_HONEYBADGER_CHECKIN_URL);}
 catch{throw Error('Honeybadger check-in secret has an invalid URL format (regenerate/copy its HTTPS report URL)');}
 try{browserstackCredentials(env);}
 catch{throw Error('BrowserStack credential secrets are invalid or incomplete');}
 if(typeof env.CODECOV_TOKEN!=='string'||!(/^[a-z0-9_-]{12,128}$/i.test(env.CODECOV_TOKEN)))
  throw Error('CODECOV_TOKEN has an invalid shape; copy the repository upload token');
 return {
  honeybadger:'format validated; no check-in sent',
  browserstack:'credential shape validated',
  codecov:'token present; upload verification required'
 };
}

/**
 * Read-only BrowserStack account check confirms credentials and plan rights
 * without consuming a browser session. Honeybadger and Codecov are verified
 * without a fake heartbeat or uploading fabricated data.
 */
export async function verifyEducationReadiness(env,{fetcher=fetch}={}){
 const local=validateEducationSecrets(env);
 const plan=await verifyBrowserstackPlan(browserstackCredentials(env),{fetcher});
 return {secrets:local,browserstack:{verified:plan.verified,plan:plan.plan,parallelSlots:plan.parallelSessionsMax}};
}
