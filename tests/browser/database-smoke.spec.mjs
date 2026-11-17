import {test,expect} from '@playwright/test';

test.skip(process.env.RUN_LIVE_DB_BROWSER!=='1','Requires an isolated seeded PostgreSQL test service');

// No mocked API and no production credentials: this suite runs on a freshly
// seeded isolated PostgreSQL service in GitHub Actions.
test('real database public API exposes reviewed claims and rejects personal workspace writes',async({request})=>{
 const summaryResponse=await request.get('/api/data?view=summary');
 expect(summaryResponse.ok()).toBeTruthy();
 const summary=await summaryResponse.json();
 expect(summary.companies).toBeGreaterThan(0);
 expect(summary.claims).toBeGreaterThan(0);
 expect(summary.sources).toBeGreaterThan(0);
 expect(summary.jobs).toEqual([]);
 const searchResponse=await request.get('/api/data?page=1');
 expect(searchResponse.ok()).toBeTruthy();
 const search=await searchResponse.json();
 expect(search.total).toBeGreaterThan(0);
 expect(search.companies.length).toBeGreaterThan(0);
 const first=search.companies[0];
 expect(first.claims.length).toBeGreaterThan(0);
 expect(first.claims.some(c=>c.evidence.some(e=>e.relationship==='supports'&&e.url))).toBeTruthy();
 const companyResponse=await request.get('/api/data?view=company&id='+encodeURIComponent(first.id));
 expect(companyResponse.ok()).toBeTruthy();
 expect((await companyResponse.json()).id).toBe(first.id);
 const sourcesResponse=await request.get('/api/data?view=sources');
 expect(sourcesResponse.ok()).toBeTruthy();
 expect((await sourcesResponse.json()).length).toBeGreaterThan(0);
 expect((await request.get('/api/data?view=workspace')).status()).toBe(403);
 expect((await request.post('/api/data',{data:{kind:'note',key:'not-allowed',value:'no'}})).status()).toBe(403);
});

test('real database discovery, company profile and browser-only watchlist journey',async({page})=>{
 await page.goto('/discover');
 await expect(page.getByRole('heading',{name:'Company discovery'})).toBeVisible();
 const row=page.locator('.cb-company-row').first();
 await expect(row).toBeVisible();
 const name=(await row.locator('.cb-company-copy strong').innerText()).trim();
 await row.getByRole('button',{name:'Save '+name+' to My watchlist'}).click();
 await expect(row.getByRole('button',{name:'Remove '+name+' from My watchlist'})).toBeVisible();
 await page.goto('/watchlists');
 await expect(page.locator('.cb-company-row').filter({hasText:name})).toBeVisible();
 await page.getByRole('link',{name:/Add companies/}).click();
 await expect(page).toHaveURL(/\/discover$/);
 await page.locator('.cb-company-row').first().locator('.cb-row-hit').click();
 await expect(page.getByRole('heading',{name:name,exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Sources',exact:true}).click();
 await expect(page.locator('.claim-row').first()).toBeVisible();
});
