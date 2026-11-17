import {test,expect} from '@playwright/test';
import {installResearchFixtures,waitForDirectory} from './support/fixtures.mjs';

test.beforeEach(async({page})=>{await installResearchFixtures(page);});

test('homepage and every primary navigation destination work',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:/Discover Illinois companies/i})).toBeVisible();
 await expect(page.locator('.home-company-spotlight .cb-company-row')).toHaveCount(8);
 for(const [label,path] of [['Companies','/discover'],['My Research','/watchlists'],['Learn','/learn']]){
  await page.locator('#radar-sidebar').getByRole('link',{name:new RegExp(label)}).click();
  await expect(page).toHaveURL(new RegExp(path+'$'));
 }
 await page.goto('/settings');
 await expect(page.getByRole('heading',{name:'Settings'})).toBeVisible();
 await page.goto('/sources');
 await expect(page.getByRole('heading',{name:'Sources & provenance'})).toBeVisible();
 await page.goto('/methodology');
 await expect(page.getByRole('heading',{name:'Data methodology'})).toBeVisible();
 await page.goto('/activity');
 await expect(page.getByRole('heading',{name:'Activity feed'})).toBeVisible();
});

test('global search reaches the directory and filters matching company rows',async({page})=>{
 await page.goto('/');
 const search=page.getByRole('searchbox',{name:'Search all Illinois companies'});
 await expect(search).toBeVisible();
 await search.fill('Beta');
 await page.getByRole('button',{name:'Run company search'}).click();
 await expect(page).toHaveURL(/\/discover\?q=Beta/);
 await expect(page.locator('.cb-company-row')).toHaveCount(1);
 await expect(page.locator('.cb-company-row')).toContainText('Beta Robotics');
 await expect(page.locator('.cb-active-filters')).toContainText('Search: Beta');
 await page.locator('.cb-active-filters').getByRole('button',{name:/Search: Beta/}).click();
 await expect(page.locator('.cb-company-row')).toHaveCount(12);
});

test('sector, affiliation, clear all, view toggle and pagination are functional',async({page})=>{
 await page.goto('/discover');
 await waitForDirectory(page);
 await page.getByRole('combobox',{name:'Sector filter'}).selectOption('Robotics');
 await expect(page.locator('.cb-company-row')).toHaveCount(1);
 await expect(page.locator('.cb-company-row')).toContainText('Beta Robotics');
 await page.getByRole('combobox',{name:'Affiliation filter'}).selectOption('EnterpriseWorks Incubator');
 await expect(page.locator('.cb-company-row')).toHaveCount(1);
 await page.getByRole('button',{name:'Clear all'}).click();
 await expect(page.locator('.cb-company-row')).toHaveCount(12);
 await page.getByRole('button',{name:'Card view'}).click();
 await expect(page.locator('.cb-results-panel .company-card')).toHaveCount(12);
 await page.getByRole('button',{name:'Table view'}).click();
 await expect(page.locator('.cb-company-row')).toHaveCount(12);
 await page.locator('.pagination').getByRole('button',{name:/Next/}).click();
 await expect(page.locator('.cb-company-row')).toHaveCount(5);
 await expect(page.locator('.cb-company-row').first()).toContainText('Test Venture 10');
 await page.locator('.pagination').getByRole('button',{name:'Previous'}).click();
 await expect(page.locator('.cb-company-row')).toHaveCount(12);
 await page.getByRole('combobox',{name:'Sort companies'}).selectOption('updated');
 await expect(page.locator('.cb-company-row').first()).toContainText('Alpine Analytics');
});

test('full table row navigates to a company; watchlist bookmark does not',async({page})=>{
 await page.goto('/discover');
 await waitForDirectory(page);
 const row=page.locator('.cb-company-row').filter({hasText:'Alpine Analytics'});
 await row.getByRole('button',{name:'Save Alpine Analytics to My watchlist'}).click();
 await expect(page).toHaveURL(/\/discover$/);
 await expect(row.getByRole('button',{name:'Remove Alpine Analytics from My watchlist'})).toBeVisible();
 await row.locator('.cb-company-name-cell').click({position:{x:40,y:20}});
 await expect(page).toHaveURL(/\/companies\/alpine-analytics/);
 await expect(page.getByRole('heading',{name:'Alpine Analytics'})).toBeVisible();
});

test('company source, founder-contact, activity and research tabs open correctly',async({page})=>{
 await page.goto('/companies/alpine-analytics');
 await expect(page.getByRole('heading',{name:'Alpine Analytics'})).toBeVisible();
 await expect(page.locator('.cb-profile-facts')).toContainText('Artificial Intelligence');
 await page.getByRole('button',{name:'Founder contact'}).first().click();
 await expect(page.locator('#founder-contact')).toBeVisible();
 await expect(page.locator('#founder-contact')).toContainText('Jordan Example');
 await expect(page.locator('#founder-contact').getByRole('link',{name:/Email founder/})).toHaveAttribute('href','mailto:jordan@alpine-analytics.com');
 await expect.poll(()=>page.evaluate(()=>document.activeElement?.id)).toBe('founder-contact');
 await page.getByRole('button',{name:'Sources',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Original company sources'})).toBeVisible();
 await expect(page.locator('.claim-row .source-link').first()).toHaveAttribute('target','_blank');
 await page.getByRole('button',{name:'Signals',exact:true}).click();
 await expect(page.getByText('No verified developments recorded')).toBeVisible();
 await page.getByRole('button',{name:'Overview',exact:true}).click();
 await page.getByRole('button',{name:/View founder & team contact/}).click();
 await expect(page.locator('#founder-contact')).toBeVisible();
});

test('founder contact editing validates inputs and persists private fields',async({page})=>{
 await page.goto('/companies/alpine-analytics');
 await page.getByRole('button',{name:'Founder contact'}).first().click();
 await page.getByRole('button',{name:'Add / edit contact'}).click();
 await page.getByRole('textbox',{name:'Contact name'}).fill('Private Analyst Contact');
 await page.getByRole('textbox',{name:'Email (if known)'}).fill('not-an-email');
 await page.getByRole('button',{name:'Save private contact'}).click();
 await expect(page.getByRole('alert')).toContainText('Invalid private founder email');
 await page.getByRole('textbox',{name:'Email (if known)'}).fill('contact@alpine-analytics.com');
 await page.getByRole('textbox',{name:'Introduction context'}).fill('Met at an alumni event');
 await page.getByRole('button',{name:'Save private contact'}).click();
 await expect(page.locator('.private-contact-summary')).toContainText('Private Analyst Contact');
 await page.reload();
 await page.getByRole('button',{name:'Founder contact'}).first().click();
 await expect(page.locator('.private-contact-summary')).toContainText('Met at an alumni event');
 await expect(page.locator('.private-contact-summary').getByRole('link',{name:/contact@alpine-analytics.com/}))
  .toHaveAttribute('href','mailto:contact@alpine-analytics.com');
});

test('research notes, status, report, downloads and save confirmation work',async({page})=>{
 await page.goto('/companies/beta-robotics');
 await page.getByRole('button',{name:'Research',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Research notes'})).toBeVisible();
 await page.getByRole('textbox',{name:'Browser-saved research notes'}).fill('Meet the founders in January.');
 await page.getByRole('button',{name:/Save notes/}).click();
 await expect(page.getByRole('status').filter({hasText:'Note saved'})).toBeVisible();
 await page.getByRole('combobox',{name:'Research status'}).selectOption('Researching');
 await page.getByRole('textbox',{name:'Research report'}).fill('# Updated diligence report');
 await page.getByRole('button',{name:'Save report'}).click();
 await expect(page.getByRole('status').filter({hasText:'Report saved'})).toBeVisible();
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:/Export Markdown/}).click();
 const download=await downloadPromise;
 expect(download.suggestedFilename()).toBe('beta-robotics-research.md');
 await page.reload();
 await page.getByRole('button',{name:'Research',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Browser-saved research notes'})).toHaveValue('Meet the founders in January.');
 await expect(page.getByRole('combobox',{name:'Research status'})).toHaveValue('Researching');
 await expect(page.getByRole('textbox',{name:'Research report'})).toHaveValue('# Updated diligence report');
});

test('saving a filtered search allows reopening the same filters from research',async({page})=>{
 await page.goto('/discover');
 await page.getByRole('combobox',{name:'Sector filter'}).selectOption('Robotics');
 await page.getByRole('button',{name:/Save search/}).click();
 await expect(page.getByRole('status').filter({hasText:'Search saved in My Research'})).toBeVisible();
 await page.goto('/research');
 await page.getByRole('heading',{name:/Saved searches/}).waitFor();
 await page.locator('.saved-search').filter({hasText:'All companies'}).first().click();
 await expect(page).toHaveURL(/\/discover/);
 await expect(page.getByRole('combobox',{name:'Sector filter'})).toHaveValue('Robotics');
 await expect(page.locator('.cb-company-row')).toHaveCount(1);
});

test('learning, screening controls and methodology popovers respond',async({page})=>{
 await page.goto('/learn');
 await expect(page.getByRole('heading',{name:/Startup investing/})).toBeVisible();
 await expect(page.locator('details').first()).toHaveCount(1);
 await page.goto('/research');
 await expect(page.getByRole('heading',{name:'My investment interests'})).toBeVisible();
 await page.getByRole('textbox',{name:'Preferred sector'}).fill('Robotics');
 await page.getByRole('button',{name:'Save thesis'}).click();
 await expect(page.getByRole('status').filter({hasText:'Thesis saved'})).toBeVisible();
 await page.getByRole('textbox',{name:'Preferred sector'}).fill('Energy');
 await page.getByRole('button',{name:'Load saved thesis'}).click();
 await expect(page.getByRole('textbox',{name:'Preferred sector'})).toHaveValue('Robotics');
 const entry=page.locator('details.fit').first();
 await entry.locator('summary').click();
 await expect(entry.getByRole('button',{name:'Save evidence snapshot'})).toBeVisible();
 await entry.getByRole('button',{name:'Save evidence snapshot'}).click();
 await expect(page.getByRole('status').filter({hasText:'Evidence snapshot saved'})).toBeVisible();
 const dlPromise=page.waitForEvent('download');
 await entry.getByRole('button',{name:'Export calculation'}).click();
 const dl=await dlPromise;
 expect(dl.suggestedFilename()).toMatch(/-screening\.json$/);
 await page.goto('/discover');
 await waitForDirectory(page);
 await page.getByRole('button',{name:/About ranking/}).click();
 await expect(page.getByRole('heading',{name:/ranking/i})).toBeVisible();
 await page.getByRole('button',{name:'Close explanation'}).click();
});

test('server rejects legacy workspace writes and missing comparison route',async({page})=>{
 const read=await page.request.get('/api/data?view=workspace');
 expect(read.status()).toBe(403);
 const write=await page.request.post('/api/data',{data:{kind:'note',key:'x',value:'unexpected'}});
 expect(write.status()).toBe(403);
 await page.goto('/compare');
 await expect(page.locator('body')).toContainText(/404|not found/i);
});
