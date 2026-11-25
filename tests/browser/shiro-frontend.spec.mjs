import {test,expect} from '@playwright/test';
import {installResearchFixtures,waitForDirectory} from './support/fixtures.mjs';

test.beforeEach(async({page})=>{await installResearchFixtures(page);});

test('mobile menu is hidden until opened, closes with Escape and exposes research mode',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/discover');
 const toggle=page.getByRole('button',{name:'Toggle navigation'});
 const sidebar=page.locator('#radar-sidebar');
 await expect(sidebar).toBeHidden();
 await toggle.click();
 await expect(sidebar).toBeVisible();
 await expect(toggle).toHaveAttribute('aria-expanded','true');
 await sidebar.getByRole('button',{name:'Advanced'}).click();
 await page.keyboard.press('Escape');
 await expect(sidebar).toBeHidden();
 await expect(toggle).toBeFocused();
 await expect(page.getByText(/Search published claims, documented affiliations/)).toBeVisible();
 await toggle.click();
 await sidebar.getByRole('link',{name:'Sources'}).click();
 await expect(page).toHaveURL(/\/sources$/);
 await expect(sidebar).toBeHidden();
});

test('watchlist destination is editable from discovery without leaving the directory',async({page})=>{
 await page.goto('/watchlists');
 await page.getByRole('textbox',{name:'New watchlist name'}).fill('Climate');
 await page.getByRole('button',{name:'Create watchlist'}).click();
 await expect(page.getByRole('combobox',{name:'Current watchlist'})).toHaveValue('Climate');
 await page.goto('/discover');
 await waitForDirectory(page);
 const destination=page.getByRole('combobox',{name:'Save companies to watchlist'});
 await expect(destination).toHaveValue('Climate');
 await destination.selectOption('My watchlist');
 const row=page.locator('.cb-company-row').filter({hasText:'Beta Robotics'});
 const save=row.getByRole('button',{name:'Save Beta Robotics to My watchlist'});
 await expect(save).toHaveAttribute('aria-pressed','false');
 await save.click();
 await expect(row.getByRole('button',{name:'Remove Beta Robotics from My watchlist'})).toHaveAttribute('aria-pressed','true');
 await page.reload();
 await expect(destination).toHaveValue('My watchlist');
});

test('keyboard skip link and directory scroll region are available',async({page})=>{
 await page.goto('/discover');
 await waitForDirectory(page);
 await page.keyboard.press('Tab');
 await expect(page.getByRole('link',{name:'Skip to main content'})).toBeFocused();
 await page.keyboard.press('Enter');
 await expect(page.locator('#radar-main')).toBeFocused();
 await expect(page.getByRole('region',{name:'Company directory table'})).toHaveAttribute('tabindex','0');
});
