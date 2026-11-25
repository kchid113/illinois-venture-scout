import {test,expect} from '@playwright/test';
import {installResearchFixtures,waitForDirectory} from './support/fixtures.mjs';

test.beforeEach(async({page})=>{await installResearchFixtures(page);});

test('desktop home brings the real company index into the first viewport',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/');
 const index=page.getByRole('heading',{name:'Company index'});
 await expect(index).toBeVisible();
 await expect(page.locator('.home-company-spotlight .cb-company-row')).toHaveCount(8);
 const bounds=await page.locator('.home-company-spotlight .cb-company-row').first().boundingBox();
 expect(bounds.y+bounds.height).toBeLessThan(700);
 await expect(page.getByLabel('Database coverage')).toContainText('Sourced facts');
});

test('wide directory puts filters above the table and preserves usable controls',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/discover');
 await waitForDirectory(page);
 const filters=await page.getByRole('complementary',{name:'Company filters'}).boundingBox();
 const table=await page.locator('.cb-results-panel').boundingBox();
 expect(filters.y+filters.height).toBeLessThanOrEqual(table.y);
 expect(table.width).toBeGreaterThan(900);
 await page.getByRole('combobox',{name:'Sector filter'}).selectOption('Robotics');
 await expect(page.locator('.cb-company-row')).toHaveCount(1);
});

test('mobile home and directory contain horizontal scrolling within the table',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await expect(page.locator('.home-company-spotlight .cb-company-row')).toHaveCount(8);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
 await page.goto('/discover');
 await waitForDirectory(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
 const table=page.getByRole('region',{name:'Company directory table'});
 await expect(table).toBeVisible();
 expect(await table.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
});
