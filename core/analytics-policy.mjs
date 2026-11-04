/**
 * Only aggregate, non-user-identifying route categories are eligible.
 * A route that contains a company slug, query, note or user ID returns null.
 * The browser must never fall back to window.location.pathname when null.
 */
export const ANALYTICS_PATHS=Object.freeze({
 '/':'/overview',
 '/overview':'/overview',
 '/discover':'/discover',
 '/activity':'/activity',
 '/sources':'/sources',
 '/methodology':'/methodology'
});
export function publicAnalyticsPath(path){
 if(typeof path!=='string'||!Object.hasOwn(ANALYTICS_PATHS,path))return null;
 return ANALYTICS_PATHS[path];
}
