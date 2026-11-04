import {verifyEducationReadiness} from '../core/education-readiness.mjs';

/**
 * Safe connectivity check for GitHub Actions. Only returns enum statuses
 * and the non-sensitive Automate plan/capacity. Never prints secrets or URLs.
 * Honeybadger cron heartbeat MUST NOT be sent outside a real successful job.
 */
const status=await verifyEducationReadiness(process.env);
console.log('Honeybadger: configured URL shape; no synthetic heartbeat sent');
console.log('BrowserStack: authenticated; plan='+JSON.stringify(status.browserstack.plan)+
 ' parallel_slots='+status.browserstack.parallelSlots);
console.log('Codecov: upload token configured; verify real upload separately');
