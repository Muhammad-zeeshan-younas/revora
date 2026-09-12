import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Development screenshots only. This does not execute the test suite.
async function preview(): Promise<void> {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
    page.on('pageerror', (error) => console.error(error.message));
    await page.goto('http://127.0.0.1:5173');
    await mkdir('preview', { recursive: true });
    await page.getByRole('button', { name: 'Explore demo workspace' }).waitFor();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.screenshot({ path: 'preview/auth.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Explore demo workspace' }).click();
    await page.getByRole('heading', { name: 'A clearer view. A stronger business.' }).waitFor();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    console.log(
      await page.evaluate(() => ({
        bodyFontLoaded: document.fonts.check('400 14px "Public Sans Variable"'),
        headingFontLoaded: document.fonts.check('600 24px "Manrope Variable"'),
      })),
    );
    await page.screenshot({ path: 'preview/desktop.png', fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'preview/mobile.png', fullPage: true, animations: 'disabled' });
    console.log(
      await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      })),
    );
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page
      .getByRole('navigation')
      .getByRole('button', { name: /Payments/ })
      .click();
    await page.getByRole('button', { name: 'Review match' }).first().click();
    await page.screenshot({ path: 'preview/payment-review.png', animations: 'disabled' });
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Customers', exact: true })
      .click();
    await page.getByRole('button', { name: 'Add customer', exact: true }).click();
    await page.screenshot({ path: 'preview/customer-form.png', animations: 'disabled' });
    await page.getByRole('button', { name: 'Close dialog' }).click();
    for (const label of [
      'Customers',
      'Invoices',
      'Collections',
      'Payments',
      'Credit management',
      'Activity center',
    ]) {
      await page.getByRole('navigation').getByRole('button', { name: label }).click();
      await page.screenshot({
        path: `preview/${label.toLowerCase().replaceAll(' ', '-')}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.screenshot({ path: 'preview/settings.png', fullPage: true, animations: 'disabled' });
    console.log('Development screenshots saved to preview/.');
  } finally {
    await browser.close();
  }
}
void preview().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Preview unavailable');
  process.exitCode = 1;
});
