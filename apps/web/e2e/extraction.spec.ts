import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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

/**
 * Stubs everything on the page *except* the extraction endpoints.
 *
 * Those are served by `e2e/support/extract-stub.mjs` over a real socket:
 * interception can only answer with a whole body, and a whole body cannot
 * show rows arriving one at a time.
 */
async function stubThePageAround(page: Page): Promise<void> {
  await page.route('**/health', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(healthy) }),
  );
  await page.route('**/documents?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], nextCursor: null }),
    }),
  );
}

/**
 * Opens the Extract pane.
 *
 * Asking and extracting are two panes of one workspace rather than two
 * stacked sections, so a test for either has to say which one it is in.
 */
async function openExtract(page: Page, label: string): Promise<void> {
  await page.getByRole('tab', { name: label }).click();
}

/** The table's rows, excluding the heading row. */
function rows(page: Page) {
  return page.locator('table tbody tr');
}

test('AC13: the table fills a row at a time rather than appearing at the end', async ({ page }) => {
  await stubThePageAround(page);
  await page.goto('/en');
  await openExtract(page, 'Extract');

  await page.getByRole('button', { name: 'Build the table' }).click();

  // The first row has to be readable while the rest are still coming. If the
  // table only appeared at the end, this would time out — which is exactly
  // the failure the criterion is about.
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByRole('cell', { name: '/auth/token' })).toBeVisible();

  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page)).toHaveCount(3);

  // The first row is unchanged by the ones that followed it.
  await expect(rows(page).first().getByRole('cell').nth(1)).toHaveText('/auth/token');
});

test('AC13: the headings come from the shape the server published', async ({ page }) => {
  await stubThePageAround(page);
  await page.goto('/en');
  await openExtract(page, 'Extract');

  await page.getByRole('button', { name: 'Build the table' }).click();
  await expect(rows(page)).toHaveCount(3);

  await expect(page.getByRole('columnheader')).toHaveText(['Method', 'Path', 'Summary', 'Auth']);

  // A different shape has different columns, with no release in between.
  await page.getByLabel('What to pull out').selectOption('faq_pairs');
  await page.getByRole('button', { name: 'Build the table' }).click();

  await expect(page.getByRole('columnheader')).toHaveText(['Question', 'Answer']);
  await expect(rows(page)).toHaveCount(1);
});

test('AC13: stopping keeps the rows that already arrived', async ({ page }) => {
  await stubThePageAround(page);
  await page.goto('/en');
  await openExtract(page, 'Extract');

  await page.getByRole('button', { name: 'Build the table' }).click();
  await expect(rows(page)).toHaveCount(1);

  await page.getByRole('button', { name: 'Stop' }).click();

  // Stopping is the reader's decision, not a failure: what arrived stands.
  await expect(page.getByRole('button', { name: 'Build the table' })).toBeVisible();

  // A fixed wait, because what is being asserted is the *absence* of further
  // rows over an interval in which two more would otherwise have arrived.
  // There is no event to await for something that must not happen.
  await page.waitForTimeout(1_000);
  await expect(rows(page)).toHaveCount(1);
});

test('AC14: a finished extraction downloads as JSON', async ({ page }) => {
  await stubThePageAround(page);
  await page.goto('/en');
  await openExtract(page, 'Extract');

  await page.getByRole('button', { name: 'Build the table' }).click();
  await expect(rows(page)).toHaveCount(3);

  const started = page.waitForEvent('download');

  await page.getByRole('button', { name: 'Download JSON' }).click();

  const download = await started;

  expect(download.suggestedFilename()).toMatch(/\.json$/);

  const saved: unknown = JSON.parse(await readFile(await download.path(), 'utf8'));

  // What was downloaded is what was on the screen — the reason to extract
  // structured data is to use it elsewhere, so the file has to be the data —
  // and it says which shape it is and which passages it came from.
  expect(saved).toMatchObject({
    schema: 'api_endpoints',
    items: [
      { method: 'POST', path: '/auth/token', authenticated: false },
      { method: 'GET', path: '/invoices', authenticated: true },
      { method: 'GET', path: '/invoices/{id}', authenticated: true },
    ],
    citations: [{ documentTitle: 'lumen-api' }, { documentTitle: 'lumen-billing' }],
  });
});

test('AC15: the controls and column headings are localised in pt-BR', async ({ page }) => {
  await stubThePageAround(page);
  await page.goto('/pt-BR');
  await openExtract(page, 'Extrair');

  await expect(page.getByRole('heading', { name: 'Extrair' })).toBeVisible();
  await expect(page.getByLabel('O que extrair')).toBeVisible();

  // `exact`, because the button's label is also a word inside the heading and
  // the intro sentence above it.
  await page.getByRole('button', { name: 'Montar a tabela' }).click();

  await expect(rows(page)).toHaveCount(3);
  await expect(page.getByRole('columnheader')).toHaveText(['Método', 'Caminho', 'Resumo', 'Auth']);
  await expect(page.getByRole('button', { name: 'Baixar JSON' })).toBeVisible();

  // The shape names are translated too, not left in the English the server
  // sent.
  await expect(page.getByLabel('O que extrair')).toHaveValue('api_endpoints');
  await expect(page.getByRole('option', { name: 'Endpoints da API' })).toHaveCount(1);
});

test('AC15: the citations line is localised and names the documents', async ({ page }) => {
  await stubThePageAround(page);
  await page.goto('/pt-BR');
  await openExtract(page, 'Extrair');

  await page.getByRole('button', { name: 'Montar a tabela' }).click();
  await expect(rows(page)).toHaveCount(3);

  await expect(page.getByText(/Lido de 2 trechos em lumen-api (e|&) lumen-billing/)).toBeVisible();
});

test('the extracted table has no accessibility violations', async ({ page }) => {
  await stubThePageAround(page);
  await page.goto('/en');
  await openExtract(page, 'Extract');

  await page.getByRole('button', { name: 'Build the table' }).click();
  await expect(rows(page)).toHaveCount(3);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});
