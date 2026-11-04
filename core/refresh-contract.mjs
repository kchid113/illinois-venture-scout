/**
 * The scheduled refresher must not interpret a nominal HTTP 2xx or a
 * syntactically valid JSON body as proof of successful ingestion.
 *
 * Keep the provider-neutral contract small, strict and independently
 * testable. All connectors return the same fields from refreshConnector.
 */
const CONNECTOR=/^[a-z0-9][a-z0-9-]{1,80}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[4-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const COUNTERS=Object.freeze(['observed','imported','staged','deferred']);

export function validateRefreshResponse(requestedConnector,payload){
 if(typeof requestedConnector!=='string'||!CONNECTOR.test(requestedConnector))
  throw Error('Invalid requested refresh connector');
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||
    Object.getPrototypeOf(payload)!==Object.prototype)
  throw Error('Refresh endpoint returned an invalid result');
 if(payload.connector!==requestedConnector)
  throw Error('Refresh endpoint returned a different connector result');
 if(payload.ok===false||payload.error!=null||payload.status==='Failed')
  throw Error('Refresh endpoint reported failure');
 if(typeof payload.jobId!=='string'||!UUID.test(payload.jobId))
  throw Error('Refresh endpoint omitted its persisted job identifier');
 for(const key of COUNTERS){
  if(!Number.isSafeInteger(payload[key])||payload[key]<0)
   throw Error('Refresh endpoint returned an invalid '+key+' count');
 }
 if(payload.imported+payload.staged>payload.observed)
  throw Error('Refresh endpoint returned inconsistent record counts');
 return Object.freeze({
  connector:payload.connector,jobId:payload.jobId,
  observed:payload.observed,imported:payload.imported,
  staged:payload.staged,deferred:payload.deferred
 });
}

/** Avoid logging response bodies: a misconfigured server could include secrets. */
export function refreshHttpError(status){
 if(!Number.isInteger(status)||status<100||status>599)return Error('Refresh endpoint returned an invalid HTTP status');
 return Error('HTTP '+status+' from refresh endpoint (inspect authenticated ingestion jobs for details)');
}
