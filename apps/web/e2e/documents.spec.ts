import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const ready = {
  id: '7f3a9c0e-1b2d-4e5f-8a90-1c2d3e4f5a6b',
  title: 'lumen-api',
  sourceFilename: 'lumen-api.md',
  mimeType: 'text/markdown',
  sizeBytes: 4_200,
  status: 'ready',
  progress: 100,
  language: 'english',
  error: null,
  pageCount: null,
  chunkCount: 7,
  createdAt: '2026-10-30T12:00:00.000Z',
  updatedAt: '2026-10-30T12:00:30.000Z',
};

const failed = {
  ...ready,
  id: '0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d',
  title: 'scan',
  sourceFilename: 'scan.pdf',
  status: 'failed',
  progress: 40,
  chunkCount: 0,
  language: null,
  error: 'the PDF has no text layer; it needs OCR',
};

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
 * Stubs the API at the network layer.
 *
 * The journey under test is the interface, so the API is stubbed: the suite
 * stays deterministic, needs no containers, and costs nothing. That the real
 * API behaves this way is covered by its own e2e and contract suites.
 */
async function stubApi(page: Page, documents: unknown[]): Promise<void> {
  await page.route('**/health', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(healthy) }),
  );
  await page.route('**/documents?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: documents, nextCursor: null }),
    }),
  );
}

test('AC1: an empty corpus explains how to start', async ({ page }) => {
  await stubApi(page, []);
  await page.goto('/en');

  await expect(page.getByText('No documents yet')).toBeVisible();
  await expect(page.getByText(/Add a PDF, Markdown or text file/)).toBeVisible();
});

test('AC7: a ready document shows what makes it searchable', async ({ page }) => {
  await stubApi(page, [ready]);
  await page.goto('/en');

  const row = page.getByRole('listitem').filter({ hasText: 'lumen-api' });

  await expect(row).toBeVisible();
  // The state is a dot with the word for assistive technology; the count is
  // revealed when the row is reached, so a rail is a list of titles.
  await expect(row.getByText('Ready', { exact: true })).toBeAttached();

  await row.hover();
  await expect(row.getByText(/7 passages/)).toBeVisible();
});

test("AC8: a failed document shows the server's reason and offers retry", async ({ page }) => {
  await stubApi(page, [failed]);
  await page.goto('/en');

  await expect(page.getByText('the PDF has no text layer; it needs OCR')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('AC10: deleting asks first', async ({ page }) => {
  await stubApi(page, [ready]);
  await page.goto('/en');

  // Reached before it can be pressed: row actions appear on hover or focus
  // rather than sitting in every row.
  const row = page.getByRole('listitem').filter({ hasText: 'lumen-api' });

  await row.hover();
  await row.getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByText('Delete this document and its passages?')).toBeVisible();
});

test('AC14: the library is fully localised in pt-BR', async ({ page }) => {
  await stubApi(page, [ready]);
  await page.goto('/pt-BR');

  await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();
  await expect(page.getByText('Arraste um documento aqui, ou escolha um')).toBeVisible();
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'lumen-api' })
      .getByText('Pronto', { exact: true }),
  ).toBeAttached();
  await expect(page.getByText(/7 trechos/)).toBeVisible();
  // The size separator follows the locale, which is the thing that breaks when
  // a number is assembled by hand instead of formatted.
  await expect(page.getByText(/4,2 kB/)).toBeVisible();
});

test('AC14: the empty state is localised too', async ({ page }) => {
  await stubApi(page, []);
  await page.goto('/pt-BR');

  await expect(page.getByText('Nenhum documento ainda')).toBeVisible();
});

test('the upload control is reachable without a mouse', async ({ page }) => {
  await stubApi(page, []);
  await page.goto('/en');

  const input = page.getByLabel('Choose a document to upload');
  await input.focus();

  await expect(input).toBeFocused();
});

test('the library page has no detectable accessibility violations', async ({ page }) => {
  await stubApi(page, [ready, failed]);
  await page.goto('/en');
  await expect(page.getByText('lumen-api', { exact: true })).toBeVisible();

  const { violations } = await new AxeBuilder({ page }).analyze();

  expect(violations).toEqual([]);
});
