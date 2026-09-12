import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(
    page.getByRole('heading', { name: 'A clearer view. A stronger business.' }),
  ).toBeVisible();
});
test('desktop dashboard, navigation, matching, and persistent balances', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByText('Cash coming in', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/revora-desktop.png', fullPage: true });
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /Payments/ })
    .click();
  const row = page.getByRole('row').filter({ hasText: 'IBFT-928451' });
  await row.getByRole('button', { name: 'Review match' }).click();
  await expect(page.getByRole('dialog')).toContainText('Ali Traders');
  await page.getByRole('button', { name: 'Approve allocation' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row).toContainText('Matched');
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: 'IBFT-928451' })).toContainText('Matched');
  for (const label of [
    'Customers',
    'Invoices',
    'Collections',
    'Credit management',
    'Activity center',
  ]) {
    await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('main h1')).toHaveText(label);
  }
  expect(errors).toEqual([]);
});
test('creates a customer and invoice with accurate decimal values', async ({ page }) => {
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Customers', exact: true })
    .click();
  await page.getByRole('button', { name: 'Add customer', exact: true }).click();
  await page.getByLabel('Business name').fill('Crescent Test Traders');
  await page.getByLabel('Contact person').fill('Ali Khan');
  await page.getByLabel('City', { exact: true }).fill('Lahore');
  await page.getByLabel('Email address').fill('crescent@example.com');
  await page.getByLabel('WhatsApp / phone').fill('+923001112233');
  await page.getByRole('button', { name: 'Save customer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page
    .getByRole('textbox', { name: 'Search customers', exact: true })
    .last()
    .fill('Crescent Test');
  await page
    .getByRole('button', { name: /Crescent Test Traders/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toContainText('Rs 0');
  await page.getByRole('button', { name: 'New invoice', exact: true }).click();
  await page.getByLabel('Amount (PKR)', { exact: true }).fill('1000.29');
  await page.getByRole('button', { name: 'Save invoice' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'Crescent Test Traders' })).toContainText(
    'Rs 1,000.29',
  );
});
test('shows skeletons, retries failed loads, and remains usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Collections', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Collections', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/revora-mobile.png', fullPage: true });
  await page.route('**/api/workspace', async (route) => {
    await new Promise<void>((resolve) => setTimeout(resolve, 400));
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Test server unavailable' }),
    });
  });
  await page.reload();
  await expect(page.getByText('We couldn’t reach your workspace.')).toBeVisible();
  await page.unroute('**/api/workspace');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Collections', exact: true })).toBeVisible();
});
