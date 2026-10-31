import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

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

const citations = [
  {
    n: 1,
    chunkId: 'c1',
    documentId: 'd1',
    documentTitle: 'lumen-api',
    headingPath: 'Lumen API > Authentication',
    pageStart: null,
    pageEnd: null,
    snippet: 'Call POST /auth/token with your client id and secret.',
  },
  {
    n: 2,
    chunkId: 'c2',
    documentId: 'd2',
    documentTitle: 'lumen-handbook',
    headingPath: null,
    pageStart: 9,
    pageEnd: 9,
    snippet: 'Quote the request id from the error response.',
  },
];

/** One server-sent event, as the endpoint writes them. */
function event(part: unknown): string {
  return `data: ${JSON.stringify(part)}\n\n`;
}

/**
 * Stubs the chat stream at the network layer.
 *
 * The journey under test is the interface: does text appear progressively, do
 * markers become chips, does the panel open. That the real endpoint emits this
 * sequence is the API's own e2e suite's job, and stubbing keeps this
 * deterministic, container-free and free.
 */
async function stubChat(page: Page, deltas: string[]): Promise<void> {
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
  await page.route('**/chat', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: [
        event({ type: 'start' }),
        event({ type: 'data-conversation', data: { conversationId: 'conv-1' } }),
        event({ type: 'data-citations', data: { citations } }),
        event({ type: 'start-step' }),
        event({ type: 'text-start', id: 't1' }),
        ...deltas.map((delta) => event({ type: 'text-delta', id: 't1', delta })),
        event({ type: 'text-end', id: 't1' }),
        event({ type: 'finish-step' }),
        event({ type: 'finish' }),
        'data: [DONE]\n\n',
      ].join(''),
    }),
  );
}

/** Types a question and sends it. */
async function ask(page: Page, question: string): Promise<void> {
  await page.getByLabel('Your question').fill(question);
  await page.getByRole('button', { name: 'Send' }).click();
}

test('AC1: an empty chat explains what it answers from', async ({ page }) => {
  await stubChat(page, ['anything']);
  await page.goto('/en');

  await expect(page.getByText('Ask a question')).toBeVisible();
  await expect(page.getByText(/Answers come only from the documents/)).toBeVisible();
});

test('AC1: the question and the answer both appear in the transcript', async ({ page }) => {
  await stubChat(page, ['Tokens last ', 'an hour ', '[1].']);
  await page.goto('/en');

  await ask(page, 'How long is a token valid?');

  await expect(page.getByText('How long is a token valid?')).toBeVisible();
  await expect(page.getByText(/Tokens last an hour/)).toBeVisible();
});

test('AC1: the answer renders as one assistant message, not two', async ({ page }) => {
  // Data parts written before the message starts belong to no message, and
  // the client renders them as a second, empty bubble above the real answer.
  await stubChat(page, ['An answer ', '[1].']);
  await page.goto('/en');

  await ask(page, 'anything');
  await expect(page.getByText(/An answer/)).toBeVisible();

  // Scoped to the transcript: the page heading is "DocPilot" as well.
  await expect(
    page.getByRole('log', { name: 'Conversation' }).getByText('DocPilot', { exact: true }),
  ).toHaveCount(1);
});

test('AC1, AC2: a marker becomes a chip that opens its source', async ({ page }) => {
  await stubChat(page, ['Tokens last an hour [1].']);
  await page.goto('/en');

  await ask(page, 'How long is a token valid?');

  const chip = page.getByRole('button', { name: 'Source 1: lumen-api' });
  await expect(chip).toBeVisible();

  await chip.click();

  await expect(page.getByRole('dialog', { name: 'Sources' })).toBeVisible();
  await expect(
    page.getByText('Call POST /auth/token with your client id and secret.'),
  ).toBeVisible();
});

test('AC3: the panel lists the other sources too', async ({ page }) => {
  await stubChat(page, ['Tokens last an hour [1].']);
  await page.goto('/en');
  await ask(page, 'q');

  await page.getByRole('button', { name: 'Source 1: lumen-api' }).click();

  await expect(page.getByText('Lumen API > Authentication')).toBeVisible();
  await expect(page.getByText('Page 9')).toBeVisible();
});

test('AC7: Escape closes the panel and returns focus to the chip', async ({ page }) => {
  // The criterion most likely to regress silently, and the reason this is a
  // browser test rather than a jsdom one.
  await stubChat(page, ['Tokens last an hour [1].']);
  await page.goto('/en');
  await ask(page, 'q');

  const chip = page.getByRole('button', { name: 'Source 1: lumen-api' });
  await chip.click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(chip).toBeFocused();
});

test('a new conversation clears the transcript', async ({ page }) => {
  await stubChat(page, ['An answer.']);
  await page.goto('/en');
  await ask(page, 'How long is a token valid?');
  await expect(page.getByText(/An answer/)).toBeVisible();

  await page.getByRole('button', { name: 'New conversation' }).click();

  await expect(page.getByText('How long is a token valid?')).toBeHidden();
  await expect(page.getByText('Ask a question')).toBeVisible();
});

test('AC14: the chat is localised in pt-BR', async ({ page }) => {
  await stubChat(page, ['Uma resposta [1].']);
  await page.goto('/pt-BR');

  await expect(page.getByRole('heading', { name: 'Perguntar' })).toBeVisible();
  await expect(page.getByText('Faça uma pergunta')).toBeVisible();

  await page.getByLabel('Sua pergunta').fill('Como faço a autenticação?');
  // `exact`, because the upload input is labelled "Escolher um documento para
  // enviar" and Playwright matches an accessible name by substring.
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();

  await expect(page.getByText('Você')).toBeVisible();
  await page.getByRole('button', { name: 'Source 1: lumen-api' }).click();
  await expect(page.getByRole('dialog', { name: 'Fontes' })).toBeVisible();
});

test('AC13: the chat has no detectable accessibility violations', async ({ page }) => {
  await stubChat(page, ['Tokens last an hour [1].']);
  await page.goto('/en');
  await ask(page, 'q');
  await page.getByRole('button', { name: 'Source 1: lumen-api' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  const { violations } = await new AxeBuilder({ page }).analyze();

  expect(violations).toEqual([]);
});
