import {test,expect} from '@playwright/test';
import {installResearchFixtures,fixtureResponse,waitForDirectory} from './support/fixtures.mjs';

test.beforeEach(async({page})=>{await installResearchFixtures(page);});

test('beginner and advanced controls change guidance and persist across navigation',async({page})=>{
 await page.goto('/discover');
 await expect(page.getByText('Find startups by name or industry.')).toBeVisible();
 await page.getByRole('button',{name:'Advanced'}).click();
 await expect(page.getByText(/Search published claims, documented affiliations/)).toBeVisible();
 await page.goto('/');
 await page.goto('/discover');
 await expect(page.getByText(/Search published claims, documented affiliations/)).toBeVisible();
 await page.getByRole('button',{name:'Beginner'}).click();
 await expect(page.getByText('Find startups by name or industry.',{exact:false})).toBeVisible();
});

test('browse, create-watchlist link, card bookmark and full-card navigation are usable',async({page})=>{
 await page.goto('/');
 await page.getByRole('link',{name:/Browse all companies/}).first().click();
 await expect(page).toHaveURL(/\/discover$/);
 await page.getByRole('button',{name:'Card view'}).click();
 const card=page.locator('.company-card').filter({hasText:'Beta Robotics'});
 await card.getByRole('button',{name:'Save Beta Robotics to My watchlist'}).click();
 await expect(card.getByRole('button',{name:'Remove Beta Robotics from My watchlist'})).toBeVisible();
 await card.getByRole('link',{name:/Explore Beta Robotics company profile/}).click();
 await expect(page).toHaveURL(/\/companies\/beta-robotics/);
 await page.getByRole('button',{name:'Saved',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Removed Beta Robotics'})).toBeVisible();
 await page.goto('/discover');
 await page.getByRole('link',{name:'Create / manage watchlists'}).click();
 await expect(page).toHaveURL(/\/watchlists$/);
});

test('quick filters, removable chips, sorting and pagination control the directory',async({page})=>{
 await page.goto('/discover');
 await waitForDirectory(page);
 await page.getByRole('button',{name:'EnterpriseWorks',exact:true}).click();
 await expect(page.locator('.cb-company-row')).toHaveCount(1);
 await expect(page.locator('.cb-company-row')).toContainText('Beta Robotics');
 await page.getByRole('button',{name:'iVenture',exact:true}).click();
 await expect(page.locator('.cb-company-row')).toHaveCount(1);
 await expect(page.locator('.cb-company-row')).toContainText('Gamma Energy');
 await page.getByRole('button',{name:'Research Park',exact:true}).click();
 await expect(page.locator('.cb-company-row')).toHaveCount(12);
 await page.getByRole('searchbox',{name:'Search companies'}).fill('Alpine');
 await expect(page.locator('.cb-company-row')).toHaveCount(1);
 await page.locator('.cb-active-filters').getByRole('button',{name:/Search: Alpine/}).click();
 await expect(page.locator('.cb-company-row')).toHaveCount(12);
 await page.getByRole('button',{name:'Clear all'}).click();
 await page.getByRole('combobox',{name:'Sort companies'}).selectOption('updated');
 await page.locator('.pagination').getByRole('button',{name:/Next/}).click();
 await expect(page.locator('.cb-company-row')).toHaveCount(5);
 await page.locator('.pagination').getByRole('button',{name:'Previous'}).click();
 await expect(page.locator('.cb-company-row')).toHaveCount(12);
});

test('profile tabs, contact editor, status, report and source controls respond',async({page})=>{
 await page.goto('/companies/alpine-analytics');
 await page.getByRole('button',{name:'Founder contact'}).first().click();
 await expect(page.locator('#founder-contact')).toBeVisible();
 await page.getByRole('button',{name:'Add / edit contact'}).click();
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await expect(page.locator('.private-contact-form')).toHaveCount(0);
 await page.getByRole('button',{name:'Sources',exact:true}).click();
 await expect(page.locator('.claim-row').first().getByRole('link',{name:/Open original source/})).toHaveAttribute('target','_blank');
 await page.getByRole('button',{name:'Signals',exact:true}).click();
 await expect(page.getByText('No verified developments recorded')).toBeVisible();
 await page.getByRole('button',{name:'Research',exact:true}).click();
 await page.getByRole('combobox',{name:'Research status'}).selectOption('Further diligence');
 await page.getByRole('textbox',{name:'Browser-saved research notes'}).fill('Request customer references');
 await page.getByRole('button',{name:/Save notes/}).click();
 await expect(page.getByRole('status').filter({hasText:'Note saved'})).toBeVisible();
 await page.getByRole('textbox',{name:'Research report'}).fill('# Due diligence');
 await page.getByRole('button',{name:'Save report'}).click();
 await expect(page.getByRole('status').filter({hasText:'Report saved'})).toBeVisible();
 await page.reload();
 await page.getByRole('button',{name:'Research',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Research status'})).toHaveValue('Further diligence');
 await expect(page.getByRole('textbox',{name:'Research report'})).toHaveValue('# Due diligence');
});

test('saved thesis weights and evidence export controls work for multiple companies',async({page})=>{
 await page.goto('/research');
 await page.getByRole('textbox',{name:'Preferred sector'}).fill('Robotics');
 await page.getByRole('textbox',{name:'Technology keywords (comma separated)'}).fill('automation, software');
 await page.locator('.weight').first().locator('input[type=range]').press('End');
 await page.getByRole('button',{name:'Save thesis'}).click();
 await expect(page.getByRole('status').filter({hasText:'Thesis saved'})).toBeVisible();
 await page.reload();
 await page.getByRole('button',{name:'Load saved thesis'}).click();
 await expect(page.getByRole('textbox',{name:'Preferred sector'})).toHaveValue('Robotics');
 await expect(page.locator('.weight').first().locator('input[type=range]')).toHaveValue('100');
 const first=page.locator('details.fit').first();
 await first.locator('summary').click();
 const downloadPromise=page.waitForEvent('download');
 await first.getByRole('button',{name:'Export calculation'}).click();
 expect((await downloadPromise).suggestedFilename()).toMatch(/-screening\.json$/);
 await first.getByRole('button',{name:'Save evidence snapshot'}).click();
 await expect(page.getByRole('status').filter({hasText:'Evidence snapshot saved'})).toBeVisible();
 await page.locator('.notes-list').filter({hasText:'Saved screening snapshots'}).getByRole('button',{name:/Download/}).first().click();
});

test('slow obsolete search cannot replace newer directory results',async({page})=>{
 await page.goto('/discover');
 await waitForDirectory(page);
 let releaseOld;
 await page.route('**/api/data?*',async route=>{
  const query=new URL(route.request().url()).searchParams.get('q');
  const {status,data}=fixtureResponse(route.request().url());
  const fulfill=()=>route.fulfill({status,contentType:'application/json',headers:{'cache-control':'no-store'},body:JSON.stringify(data)});
  if(query==='Gamma'){releaseOld=fulfill;return;}
  return fulfill();
 });
 const requestSeen=page.waitForRequest(req=>req.url().includes('/api/data?')&&new URL(req.url()).searchParams.get('q')==='Gamma');
 const search=page.getByRole('searchbox',{name:'Search companies'});
 await search.fill('Gamma');
 await requestSeen;
 await expect.poll(()=>Boolean(releaseOld)).toBe(true);
 await search.fill('Beta');
 await expect(page.locator('.cb-company-row')).toHaveCount(1);
 await expect(page.locator('.cb-company-row')).toContainText('Beta Robotics');
 const oldResolved=page.waitForResponse(response=>response.url().includes('/api/data?')&&new URL(response.url()).searchParams.get('q')==='Gamma');
 await releaseOld();
 await oldResolved;
 await expect(page.locator('.cb-company-row')).toContainText('Beta Robotics');
 await expect(page.locator('.cb-company-row').filter({hasText:'Gamma Energy'})).toHaveCount(0);
});

test('learning glossary, methodology dialog and export backup are interactive',async({page})=>{
 await page.goto('/learn');
 const glossary=page.locator('.glossary-item').first();
 await glossary.locator('summary').click();
 await expect(glossary).toHaveAttribute('open','');
 await page.goto('/methodology');
 await expect(page.getByRole('heading',{name:'Data methodology'})).toBeVisible();
 await page.goto('/settings');
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:/Export research backup/}).click();
 expect((await downloadPromise).suggestedFilename()).toBe('illinois-venture-radar-research.json');
 await expect(page.getByRole('status').filter({hasText:'Research backup downloaded'})).toBeVisible();
});
