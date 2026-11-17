/**
 * Browser tests use synthetic, deterministic UI fixtures. They never publish
 * fake startups to Supabase or alter production source records.
 */
const checked='2026-11-01T18:00:00.000Z';

const evidence=(companyId,field)=>({
 id:'ev-'+companyId+'-'+field.replaceAll(' ','-'),
 source_id:'src-'+companyId,
 relationship:'supports',
 url:'https://researchpark.illinois.edu/'+companyId+'/',
 title:'Official test-directory listing for '+companyId,
 publisher:'University of Illinois Research Park (test fixture)',
 excerpt:'Synthetic published fixture claim',
 published_at:null,
 retrieved_at:checked,
 last_checked:checked,
 accessibility:'Accessible'
});
const claim=(id,field,value)=>({
 id:'claim-'+id+'-'+field.replaceAll(' ','-'),
 field,value,classification:field==='description'?'Company-reported':'Verified factual',
 status:'Published',
 evidence:[evidence(id,field)]
});

const makeCompany=(id,name,sector,affiliation,description,other=[])=>({
 id,name,profile:'https://researchpark.illinois.edu/'+id+'/',
 updated_at:checked,
 first_observed:checked,
 claims:[
  claim(id,'name',name),
  ...(description?[claim(id,'description',description)]:[]),
  claim(id,'sector',sector),
  claim(id,'affiliation',affiliation),
  ...other.map(([field,value])=>claim(id,field,value))
 ],
 signals:[]
});

const base=[
 makeCompany('alpine-analytics','Alpine Analytics','Artificial Intelligence','Research Park tenant',
  'Software that studies industrial operations.',[['founder','Jordan Example'],['founder email','jordan@alpine-analytics.com'],['website','https://alpine-analytics.com']]),
 makeCompany('beta-robotics','Beta Robotics','Robotics','EnterpriseWorks Incubator',
  'Robotic systems for factory automation.'),
 makeCompany('gamma-energy','Gamma Energy','Energy','iVenture Accelerator',
  'Energy systems for commercial facilities.')
];
const extra=Array.from({length:14},(_,index)=>{
 const n=String(index+1).padStart(2,'0');
 return makeCompany('test-venture-'+n,'Test Venture '+n,'Software','Research Park tenant',
  'Synthetic early-stage software company '+n+'.');
});
export const fixtureCompanies=[...base,...extra];
export const fixtureSummary={
 companies:fixtureCompanies.length,
 claims:fixtureCompanies.reduce((total,c)=>total+c.claims.length,0),
 sources:fixtureCompanies.length,
 signals:1,conflicts:0,recent:0,
 sectors:[{name:'Artificial Intelligence',count:1},{name:'Robotics',count:1},{name:'Energy',count:1},{name:'Software',count:14}],
 lastChecked:checked,oldestCheck:checked,jobs:[]
};

export function fixtureResponse(url){
 const p=new URL(url).searchParams;
 const view=p.get('view');
 if(view==='workspace')return {status:403,data:{error:'Personal research is stored in this browser'}};
 if(view==='summary')return {status:200,data:fixtureSummary};
 if(view==='company'){
  const c=fixtureCompanies.find(x=>x.id===p.get('id'))||null;
  return {status:200,data:c};
 }
 if(view==='sources'){
  return {status:200,data:fixtureCompanies.map(c=>({
   id:'src-'+c.id,
   url:c.profile,
   title:'Official test-directory listing for '+c.name,
   publisher:'University of Illinois Research Park (test fixture)',
   published_at:null,retrieved_at:checked,last_checked:checked,
   accessibility:'Accessible'
  }))};
 }
 if(view==='signals')return {status:200,data:[]};
 const q=(p.get('q')||'').toLowerCase().trim();
 const sector=(p.get('sector')||'').toLowerCase().trim();
 const affiliation=(p.get('affiliation')||'').toLowerCase().trim();
 const sort=p.get('sort')||'name';
 const page=Math.max(1,Number(p.get('page')||1));
 let matched=fixtureCompanies.filter(c=>
  (!q||[c.name,...c.claims.map(cl=>cl.value)].some(text=>text.toLowerCase().includes(q)))&&
  (!sector||c.claims.some(cl=>cl.field==='sector'&&cl.value.toLowerCase().includes(sector)))&&
  (!affiliation||c.claims.some(cl=>cl.field==='affiliation'&&cl.value.toLowerCase().includes(affiliation)))
 );
 matched=[...matched].sort((a,b)=>sort==='updated'?
  b.updated_at.localeCompare(a.updated_at)||a.name.localeCompare(b.name):
  a.name.localeCompare(b.name));
 return {status:200,data:{companies:matched.slice((page-1)*12,page*12),total:matched.length}};
}

/** Mock only the public data reads; Next.js pages and all client-side logic are real. */
export async function installResearchFixtures(page){
 await page.route('**/api/data?*',async route=>{
  const {status,data}=fixtureResponse(route.request().url());
  if(route.request().method()!=='GET')
   return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'Personal writes forbidden'})});
  return route.fulfill({
   status,contentType:'application/json',
   headers:{'cache-control':'no-store'},
   body:JSON.stringify(data)
  });
 });
}

export async function waitForDirectory(page){
 await page.locator('.cb-company-row').first().waitFor({state:'visible'});
}
