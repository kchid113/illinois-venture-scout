import {DEFAULT_WEIGHTS} from './methodology.mjs';

/** Validate user-authored research before loading it into live form controls. */
const textField=(value,max,label)=>{
 if(typeof value!=='string'||value.length>max)throw Error('Invalid saved '+label);
 return value.trim();
};
export function savedSearchName({q='',sector='',affiliation=''}) {
 const pieces=[
  q.trim()? 'Search: '+q.trim():null,
  sector.trim()? 'Sector: '+sector.trim():null,
  affiliation.trim()? 'Connection: '+affiliation.trim():null
 ].filter(Boolean);
 return (pieces.join(' · ')||'All companies').slice(0,150);
}

export function parseSavedSearch(raw) {
 let data;
 try{data=JSON.parse(raw);}catch{throw Error('Saved search data cannot be read');}
 if(!data||typeof data!=='object'||Array.isArray(data))
  throw Error('Invalid saved search');
 return {
  q:textField(data.q??'',120,'search keyword'),
  sector:textField(data.sector??'',100,'search sector'),
  affiliation:textField(data.affiliation??'',100,'search affiliation')
 };
}

export function parseSavedThesis(raw) {
 let data;
 try{data=JSON.parse(raw);}catch{throw Error('Saved thesis data cannot be read');}
 if(!data||typeof data!=='object'||Array.isArray(data)||
  !data.weights||typeof data.weights!=='object'||Array.isArray(data.weights))
  throw Error('Invalid saved thesis; the saved criteria could not be restored.');
 const weights={};
 for(const [key,defaultWeight] of Object.entries(DEFAULT_WEIGHTS)){
  const value=Number(data.weights[key]??defaultWeight);
  if(!Number.isFinite(value))throw Error('Invalid saved thesis weight: '+key);
  weights[key]=Math.min(100,Math.max(0,value));
 }
 return {
  sector:textField(data.sector??'',200,'thesis sector'),
  stage:textField(data.stage??'',200,'thesis stage'),
  keywords:textField(data.keywords??'',1000,'thesis keywords'),
  weights
 };
}
