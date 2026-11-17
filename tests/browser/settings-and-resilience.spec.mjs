import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {installResearchFixtures,waitForDirectory} from './support/fixtures.mjs';

test.beforeEach(async({page})=>{await installResearchFixtures(page);});

test('backup, clear and import recover watchlists and leave shared data untouched',async({page})=>{
 await page.goto('/watchlists');
 await page.getByRole('textbox',{name:'New watchlist name'}).fill('Due diligence');
 await page.getByRole('button',{name:'Create watchlist'}).click();
 await page.goto('/discover');
 await waitForDirectory(page);
 await page.locator('.cb-company-row').filter({hasText:'Beta Robotics'})
  .getByRole('button',{name:'Save Beta Robotics to Due diligence'}).click();
 await page.goto('/settings');
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:/Export research backup/}).click();
 const download=await downloadPromise;
 expect(download.suggestedFilename()).toBe('illinois-venture-radar-research.json');
 const backup=await readFile(await download.path(),'utf8');
 const parsed=JSON.parse(backup);
 expect(parsed.version).toBe(1);
 expect(parsed.items.find(x=>x.kind==='watchlist'&&x.key==='Due diligence')).toBeTruthy();

 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Clear saved browser research'}).click();
 await expect(page.getByRole('status').filter({hasText:'Browser research cleared'})).toBeVisible();
 await page.goto('/watchlists');
 await expect(page.getByRole('combobox',{name:'Current watchlist'})).toHaveValue('My watchlist');
 await expect(page.getByRole('combobox',{name:'Current watchlist'}).locator('option')).toHaveCount(1);
 await page.goto('/settings');
 await page.locator('input[type="file"]').setInputFiles({
  name:'research-backup.json',mimeType:'application/json',buffer:Buffer.from(backup)
 });
 await expect(page.getByRole('status').filter({hasText:'Imported'})).toBeVisible();
 await page.goto('/watchlists');
 await page.getByRole('combobox',{name:'Current watchlist'}).selectOption('Due diligence');
 await expect(page.locator('.cb-company-row').filter({hasText:'Beta Robotics'})).toBeVisible();
});

test('malformed or oversized backup imports show an error without deleting current work',async({page})=>{
 await page.goto('/watchlists');
 await page.getByRole('textbox',{name:'New watchlist name'}).fill('Protected');
 await page.getByRole('button',{name:'Create watchlist'}).click();
 await page.goto('/settings');
 await page.locator('input[type="file"]').setInputFiles({
  name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('not-json')
 });
 await expect(page.getByRole('status').filter({hasText:'unreadable'})).toBeVisible();
 await page.goto('/watchlists');
 await expect(page.getByRole('combobox',{name:'Current watchlist'}).locator('option[value="Protected"]')).toHaveCount(1);
 await page.goto('/settings');
 await page.locator('input[type="file"]').setInputFiles({
  name:'oversized.json',mimeType:'application/json',buffer:Buffer.alloc(2_000_001,0x61)
 });
 await expect(page.getByRole('status').filter({hasText:'too large'})).toBeVisible();
});

test('mobile navigation, global search and mobile filter interactions function',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Toggle navigation'})).toBeVisible();
 await expect(page.getByRole('searchbox',{name:'Search all Illinois companies'})).toBeVisible();
 await page.getByRole('button',{name:'Toggle navigation'}).click();
 await expect(page.locator('#radar-sidebar')).toHaveClass(/open/);
 await page.locator('#radar-sidebar').getByRole('link',{name:/Companies/}).click();
 await expect(page).toHaveURL(/\/discover/);
 await page.getByRole('combobox',{name:'Affiliation filter'}).selectOption('Research Park tenant');
 await expect(page.locator('.cb-company-row').first()).toBeVisible();
 await page.getByRole('button',{name:'Card view'}).click();
 await expect(page.locator('.cb-results-panel .company-card').first()).toBeVisible();
});

test('a transient data outage displays Retry and recovers without refreshing the page',async({page})=>{
 const pattern='**/api/data?view=summary';
 await page.route(pattern,route=>route.fulfill({
  status:503,contentType:'application/json',
  body:JSON.stringify({error:'Synthetic temporary outage'})
 }));
 await page.goto('/discover');
 await expect(page.getByRole('alert')).toContainText('Synthetic temporary outage');
 await page.unroute(pattern);
 await page.getByRole('button',{name:'Retry'}).click();
 await waitForDirectory(page);
 await expect(page.locator('.cb-company-row')).toHaveCount(12);
});

test('opening methodology and company original-source links never attempts to write private research to the server',async({page})=>{
 const writes=[];
 page.on('request',request=>{
  if(request.url().includes('/api/data')&&request.method()!=='GET')writes.push(request.method());
 });
 await page.goto('/companies/alpine-analytics');
 await page.getByRole('button',{name:'Sources',exact:true}).click();
 await expect(page.locator('.claim-row .source-link').first()).toHaveAttribute('rel','noopener noreferrer');
 await page.goto('/methodology');
 await expect(page.getByRole('heading',{name:'Data methodology'})).toBeVisible();
 expect(writes).toEqual([]);
});
