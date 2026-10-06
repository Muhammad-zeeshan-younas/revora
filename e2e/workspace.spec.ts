import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(
    page.getByRole('heading', { name: 'A clearer view. A stronger business.' }),
  ).toBeVisible();
});
test('loads overview and customer pages without a full snapshot until opening a record', async ({
  page,
}) => {
  const paths: string[] = [];
  page.on('request', (request) => paths.push(new URL(request.url()).pathname));
  await page.reload();
  await expect(page.getByText('Cash coming in', { exact: true })).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Customers', exact: true })
    .click();
  const search = page.getByRole('textbox', { name: 'Search customers', exact: true }).last();
  await search.fill('Ali Traders');
  const customer = page.getByRole('button', { name: /Ali Traders/ }).first();
  await expect(customer).toBeVisible();
  expect(paths).toContain('/api/workspace/bootstrap');
  expect(paths).toContain('/api/workspace/overview');
  expect(paths).toContain('/api/workspace/records/customers');
  expect(paths).not.toContain('/api/workspace');
  await customer.click();
  await expect(page.getByRole('dialog')).toContainText('Ali Traders');
  expect(paths).toContain('/api/workspace');
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
  await page
    .getByRole('button', { name: /Crescent Test Traders/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Edit account' }).click();
  await page.getByLabel('City', { exact: true }).fill('Karachi');
  await page.getByLabel('Account status').selectOption('On hold');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page
    .getByRole('button', { name: /Crescent Test Traders/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toContainText('Karachi');
  await expect(page.getByRole('dialog')).toContainText('On hold');
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

test('maps a bank statement and previews the imported receipt', async ({ page }) => {
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /Payments/ })
    .click();
  await page.getByRole('button', { name: 'Import statement' }).click();
  await page
    .getByLabel('Or paste CSV content')
    .fill('Posting,Trace,Inflow,Text\n02/01/2020,UI-TRACE-1,75.25,Settlement');
  await page.getByRole('button', { name: 'Validate import' }).click();
  await page.getByLabel('Date format').selectOption('dmy');
  await page.getByRole('combobox', { name: 'Date', exact: true }).selectOption('posting');
  await page.getByRole('combobox', { name: 'Transaction reference' }).selectOption('trace');
  await page.getByRole('combobox', { name: 'Credit', exact: true }).selectOption('inflow');
  await page.getByRole('combobox', { name: 'Description', exact: true }).selectOption('text');
  await page.getByRole('button', { name: 'Validate import' }).click();
  await expect(page.getByText('1 ready · 0 skipped · 0 errors')).toBeVisible();
  await expect(page.getByText('UI-TRACE-1')).toBeVisible();
  await page.getByLabel('Mapping name').fill('Test bank format');
  await page.getByRole('button', { name: 'Save validated mapping' }).click();
  await expect(page.getByLabel('Saved mapping')).toContainText('Test bank format');
  await page.getByRole('button', { name: 'Import 1 rows' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search payments' }).fill('UI-TRACE-1');
  await expect(page.getByRole('row').filter({ hasText: 'UI-TRACE-1' })).toContainText('Rs 75.25');

  await page.getByRole('button', { name: 'Import statement' }).click();
  await page
    .getByLabel('Or paste CSV content')
    .fill('Posting,Trace,Inflow,Text\n02/01/2020,UI-TRACE-2,50.00,Second settlement');
  await page.getByRole('button', { name: 'Validate import' }).click();
  await page.getByLabel('Saved mapping').selectOption('Test bank format');
  await expect(page.getByText('1 ready · 0 skipped · 0 errors')).toBeVisible();
  await expect(page.getByText('UI-TRACE-2')).toBeVisible();
});
