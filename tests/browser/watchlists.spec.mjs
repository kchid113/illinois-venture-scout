import {test,expect} from '@playwright/test';
import {installResearchFixtures,waitForDirectory} from './support/fixtures.mjs';

test.beforeEach(async({page})=>{await installResearchFixtures(page);});

async function createList(page,name){
 await page.goto('/watchlists');
 await page.getByRole('textbox',{name:'New watchlist name'}).fill(name);
 await page.getByRole('button',{name:'Create watchlist'}).click();
}

test('create named watchlist, bookmark a startup, switch lists and persist after reload',async({page})=>{
 await createList(page,'  Climate   Tech  ');
 await expect(page.getByRole('combobox',{name:'Current watchlist'})).toHaveValue('Climate Tech');
 await expect(page.locator('.watchlist-active-hint')).toContainText('Climate Tech');
 await expect(page.getByRole('status').filter({hasText:'Watchlist "Climate Tech" created'})).toBeVisible();

 await page.goto('/discover');
 await waitForDirectory(page);
 const row=page.locator('.cb-company-row').filter({hasText:'Beta Robotics'});
 await row.getByRole('button',{name:'Save Beta Robotics to Climate Tech'}).click();
 await expect(row.getByRole('button',{name:'Remove Beta Robotics from Climate Tech'})).toBeVisible();
 await expect(page).toHaveURL(/\/discover/);

 await page.goto('/watchlists');
 await expect(page.getByRole('combobox',{name:'Current watchlist'})).toHaveValue('Climate Tech');
 await expect(page.locator('.cb-company-row').filter({hasText:'Beta Robotics'})).toBeVisible();
 await page.getByRole('combobox',{name:'Current watchlist'}).selectOption('My watchlist');
 await expect(page.locator('.cb-company-row').filter({hasText:'Beta Robotics'})).toHaveCount(0);
 await page.getByRole('combobox',{name:'Current watchlist'}).selectOption('Climate Tech');
 await expect(page.locator('.cb-company-row').filter({hasText:'Beta Robotics'})).toBeVisible();

 await page.reload();
 await expect(page.getByRole('combobox',{name:'Current watchlist'})).toHaveValue('Climate Tech');
 await expect(page.locator('.cb-company-row').filter({hasText:'Beta Robotics'})).toBeVisible();
});

test('duplicate, empty, or case-insensitive duplicate names do not overwrite members',async({page})=>{
 await createList(page,'Fund A');
 await page.goto('/discover');
 await waitForDirectory(page);
 await page.locator('.cb-company-row').filter({hasText:'Alpine Analytics'})
  .getByRole('button',{name:'Save Alpine Analytics to Fund A'}).click();
 await page.goto('/watchlists');
 await expect(page.locator('.cb-company-row').filter({hasText:'Alpine Analytics'})).toBeVisible();
 const input=page.getByRole('textbox',{name:'New watchlist name'});
 const create=page.getByRole('button',{name:'Create watchlist'});
 for(const name of [' fund a ','FUND A','My watchlist']){
  await input.fill(name);
  await create.click();
  await expect(page.locator('.watchlist-error[role="alert"]')).toContainText('already exists');
  await expect(page.locator('.cb-company-row').filter({hasText:'Alpine Analytics'})).toBeVisible();
 }
 await input.fill(' ');
 await create.click();
 await expect(page.locator('.watchlist-error[role="alert"]')).toContainText('Enter a watchlist name');
 await expect(page.getByRole('combobox',{name:'Current watchlist'})).toHaveValue('Fund A');
 await expect(page.getByRole('combobox',{name:'Current watchlist'}).locator('option')).toHaveCount(2);
});

test('rapid bookmark toggles do not reintroduce removed companies',async({page})=>{
 await createList(page,'Sourcing');
 await page.goto('/discover');
 await waitForDirectory(page);
 const row=page.locator('.cb-company-row').filter({hasText:'Gamma Energy'});
 await row.getByRole('button',{name:'Save Gamma Energy to Sourcing'}).click();
 await row.getByRole('button',{name:'Remove Gamma Energy from Sourcing'}).click();
 await row.getByRole('button',{name:'Save Gamma Energy to Sourcing'}).click();
 const saved=await page.evaluate(()=>{
  const state=JSON.parse(localStorage.getItem('ivr-public-workspace-v1'));
  const record=state.items.find(x=>x.kind==='watchlist'&&x.key==='Sourcing');
  return JSON.parse(record.value);
 });
 expect(saved).toEqual(['gamma-energy']);
 await page.goto('/watchlists');
 await expect(page.locator('.cb-company-row').filter({hasText:'Gamma Energy'})).toBeVisible();
});

test('watchlists remain independent and active-list selection survives a cross-page journey',async({page})=>{
 await createList(page,'Fund A');
 await page.goto('/discover');
 await waitForDirectory(page);
 await page.locator('.cb-company-row').filter({hasText:'Alpine Analytics'})
  .getByRole('button',{name:'Save Alpine Analytics to Fund A'}).click();
 await createList(page,'Fund B');
 await page.goto('/discover');
 await waitForDirectory(page);
 await page.locator('.cb-company-row').filter({hasText:'Gamma Energy'})
  .getByRole('button',{name:'Save Gamma Energy to Fund B'}).click();
 await page.goto('/watchlists');
 await expect(page.locator('.cb-company-row').filter({hasText:'Gamma Energy'})).toBeVisible();
 await page.getByRole('combobox',{name:'Current watchlist'}).selectOption('Fund A');
 await expect(page.locator('.cb-company-row').filter({hasText:'Alpine Analytics'})).toBeVisible();
 await expect(page.locator('.cb-company-row').filter({hasText:'Gamma Energy'})).toHaveCount(0);
});

test('missing company record does not prevent valid watchlist entries from loading',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('ivr-public-workspace-v1',JSON.stringify({version:1,items:[
   {kind:'watchlist',key:'Recovered',value:'["missing-startup","alpine-analytics"]'}
  ]}));
  localStorage.setItem('ivr-active-watchlist','Recovered');
 });
 await page.goto('/watchlists');
 await expect(page.getByRole('combobox',{name:'Current watchlist'})).toHaveValue('Recovered');
 await expect(page.locator('.cb-company-row').filter({hasText:'Alpine Analytics'})).toBeVisible();
 await expect(page.locator('.watchlist-error[role="alert"]')).toContainText('1 saved company is unavailable');
});

test('a list created on another tab is visible without reloading',async({page,context})=>{
 await page.goto('/watchlists');
 const other=await context.newPage();
 await installResearchFixtures(other);
 await other.goto('/watchlists');
 await page.getByRole('textbox',{name:'New watchlist name'}).fill('Cross-tab');
 await page.getByRole('button',{name:'Create watchlist'}).click();
 await expect(other.getByRole('combobox',{name:'Current watchlist'})).toHaveValue('Cross-tab');
 await expect(other.getByRole('combobox',{name:'Current watchlist'}).locator('option[value="Cross-tab"]')).toHaveCount(1);
 await other.close();
});
