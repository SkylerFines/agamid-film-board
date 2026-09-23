const { test, expect } = require('@playwright/test');

test('Chrome recognizes the manifest and icons, with working install guidance', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('#access-key').fill('browser-test-key');
  await page.getByRole('button', { name: 'Open board', exact: true }).click();
  await expect(page.locator('#access-dialog')).not.toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const manifest = await cdp.send('Page.getAppManifest');
  expect(manifest.errors).toEqual([]);
  expect(JSON.parse(manifest.data).name).toBe('Agamid Film Board');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const installability = await cdp.send('Page.getInstallabilityErrors');
  expect(installability.installabilityErrors).toEqual([]);
  await page.locator('#install-app').click();
  await expect(page.locator('#install-help')).toBeVisible();
  await expect(page.locator('#install-help')).toContainText('Agamid Film');
  await page.getByRole('button', { name: 'Got it' }).click();
  expect(errors).toEqual([]);
});

test('offline launch shows recovery instructions without caching board data', async ({ page, context }) => {
  await page.goto('/');
  await page.locator('#access-key').fill('browser-test-key');
  await page.getByRole('button', { name: 'Open board', exact: true }).click();
  await expect(page.locator('#access-dialog')).not.toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  const cached = await page.evaluate(async () => {
    const result = [];
    for (const key of await caches.keys()) for (const request of await (await caches.open(key)).keys()) result.push(new URL(request.url).pathname);
    return result;
  });
  expect(cached).toEqual(['/offline.html']);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('link', { name: 'open your board again' }).click();
  await expect(page.locator('#connection')).toHaveText('Board connected');
});
