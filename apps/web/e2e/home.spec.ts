import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const healthy = {
  status: 'ok',
  version: '0.0.0',
  uptimeSeconds: 12,
  checkedAt: '2026-10-30T12:00:00.000Z',
  dependencies: {
    database: { status: 'ok', latencyMs: 3 },
    redis: { status: 'ok', latencyMs: 1 },
    storage: { status: 'ok', latencyMs: 8 },
  },
};

test.beforeEach(async ({ page }) => {
  // The journey under test is the page, not the API, so health is stubbed at
  // the network layer. That keeps the suite deterministic and free.
  await page.route('**/health', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(healthy) }),
  );
});

test('AC1: a request without a locale lands on the default one', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/en$/);
});

test('AC2: the landing page renders with its heading and status', async ({ page }) => {
  await page.goto('/en');

  await expect(page.getByRole('heading', { name: 'DocPilot', level: 1 })).toBeVisible();

  // Health is a summary line that opens, rather than four rows always on
  // screen saying the same thing four ways.
  await expect(page.getByText('All systems operational')).toBeVisible();
  await page.getByText('All systems operational').click();
  await expect(page.getByText('Database')).toBeVisible();
});

test('AC3: the page reports the API health it was served', async ({ page }) => {
  await page.goto('/en');

  await expect(page.getByText('All systems operational')).toBeVisible();
});

test('AC4: switching language re-renders the page in Portuguese', async ({ page }) => {
  await page.goto('/en');

  await page.getByLabel('Language').selectOption('pt-BR');

  await expect(page).toHaveURL(/\/pt-BR$/);
  await expect(page.getByText('Todos os sistemas operacionais')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
});

test('AC5: the Portuguese page is reachable directly', async ({ page }) => {
  await page.goto('/pt-BR');

  // The tagline moved out of a page header and into the welcome, which is
  // where a reader actually arrives.
  await expect(
    page.getByRole('heading', { name: 'Respostas que você pode conferir' }),
  ).toBeVisible();
});

test('AC6: the landing page has no detectable accessibility violations', async ({ page }) => {
  await page.goto('/en');
  // Opened, so the dependency rows are in the tree being audited rather than
  // hidden inside a collapsed disclosure.
  await page.getByText('All systems operational').click();
  await expect(page.getByText('Database')).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});
