import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { DEVELOPMENT_PASSWORD } from '../server/database/development-fixtures';

// Development screenshots of real native select popovers; this does not run the test suite.
async function previewDropdowns(): Promise<void> {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1080 },
      reducedMotion: 'reduce',
    });
    page.on('pageerror', (error) => console.error(error.message));
    await mkdir('preview', { recursive: true });
    await page.goto('http://127.0.0.1:5173');
    await page.getByLabel('Work email').fill('owner@revora.test');
    await page.getByLabel('Password', { exact: true }).fill(DEVELOPMENT_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'A clearer view. A stronger business.' }).waitFor();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    console.log(
      'Customizable selects supported:',
      await page.evaluate(() => CSS.supports('appearance', 'base-select')),
    );
    await page.getByLabel('Chart period').click();
    console.log(
      'Picker icon:',
      await page.getByLabel('Chart period').evaluate((select) => {
        const icon = getComputedStyle(select, '::picker-icon');

        return {
          rotate: icon.rotate,
          transform: icon.transform,
          width: icon.width,
          height: icon.height,
        };
      }),
    );
    await page.screenshot({ path: 'preview/dropdown-chart.png' });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    console.log(
      'Chart period after keyboard selection:',
      await page.getByLabel('Chart period').inputValue(),
    );
    await page
      .getByRole('navigation')
      .getByRole('button', { name: /Payments/ })
      .click();
    await page.getByRole('button', { name: 'Record payment', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Customer', exact: true }).click();
    await page.screenshot({ path: 'preview/dropdown-customer-desktop.png' });
    await page.keyboard.press('Escape');
    console.log('Modal remains open after closing picker:', await dialog.isVisible());
    await page.setViewportSize({ width: 390, height: 844 });
    await dialog.getByRole('combobox', { name: 'Customer', exact: true }).click();
    await page.screenshot({ path: 'preview/dropdown-customer-mobile.png' });
    console.log(
      'Mobile layout:',
      await page.evaluate(() => ({
        viewport: innerWidth,
        content: document.documentElement.scrollWidth,
      })),
    );
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.getByRole('button', { name: 'Account options', exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Role for Demo Admin').click();
    await page.screenshot({ path: 'preview/dropdown-roles.png' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Account options', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
  } finally {
    await browser.close();
  }
}

void previewDropdowns().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Dropdown preview failed.');
  process.exitCode = 1;
});
