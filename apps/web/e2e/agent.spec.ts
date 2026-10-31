import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const healthy = {
  status: 'ok',
  version: '0.1.0',
  uptimeSeconds: 12,
  checkedAt: '2026-10-31T12:00:00.000Z',
  dependencies: {
    database: { status: 'ok', latencyMs: 3 },
    redis: { status: 'ok', latencyMs: 1 },
    storage: { status: 'ok', latencyMs: 8 },
  },
};

const PROPOSAL = {
  title: 'Document the webhook retry schedule',
  body: 'The retry schedule is in support replies but not in the documentation.',
  labels: ['docs'],
};

/** One server-sent event, as the endpoint writes them. */
function event(part: unknown): string {
  return `data: ${JSON.stringify(part)}\n\n`;
}

/** Everything the server sends for a turn that called search_docs. */
function searchTurn(): string {
  return [
    event({ type: 'start' }),
    event({ type: 'data-conversation', data: { conversationId: 'conv-1' } }),
    event({ type: 'start-step' }),
    event({ type: 'tool-input-start', toolCallId: 'c1', toolName: 'search_docs' }),
    event({
      type: 'tool-input-available',
      toolCallId: 'c1',
      toolName: 'search_docs',
      input: { query: 'webhook signature' },
    }),
    event({
      type: 'tool-output-available',
      toolCallId: 'c1',
      toolName: 'search_docs',
      output: { results: [{ n: 1, documentTitle: 'lumen-webhooks', content: 'HMAC-SHA256.' }] },
    }),
    event({ type: 'finish-step' }),
    event({ type: 'start-step' }),
    event({ type: 'text-start', id: 't1' }),
    event({ type: 'text-delta', id: 't1', delta: 'Compare an HMAC [1].' }),
    event({ type: 'text-end', id: 't1' }),
    event({ type: 'finish-step' }),
    event({ type: 'finish' }),
    'data: [DONE]\n\n',
  ].join('');
}

/** Everything the server sends when it proposes a ticket and waits. */
function approvalTurn(): string {
  return [
    event({ type: 'start' }),
    event({ type: 'data-conversation', data: { conversationId: 'conv-1' } }),
    event({ type: 'start-step' }),
    event({ type: 'tool-input-start', toolCallId: 'c9', toolName: 'create_ticket' }),
    event({
      type: 'tool-input-available',
      toolCallId: 'c9',
      toolName: 'create_ticket',
      input: PROPOSAL,
    }),
    event({
      type: 'tool-approval-request',
      toolCallId: 'c9',
      toolName: 'create_ticket',
      approvalId: 'approval-1',
    }),
    event({ type: 'finish-step' }),
    event({ type: 'finish' }),
    'data: [DONE]\n\n',
  ].join('');
}

/**
 * Stubs the API, recording what the page posts back.
 *
 * The journey under test is the interface, and the one thing that has to be
 * true of it is that an answer to an approval reaches the server — and says
 * which answer it was. So the stub records the requests rather than only
 * replying to them.
 */
async function stubAgent(page: Page, body: string): Promise<{ posts: unknown[] }> {
  const posts: unknown[] = [];

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
  await page.route('**/agent', (route) => {
    posts.push(route.request().postDataJSON());

    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body,
    });
  });

  return { posts };
}

/** Turns on tool use and asks a question. */
async function askWithTools(page: Page, question: string): Promise<void> {
  await page.getByLabel('Use tools').check();
  await page.getByLabel('Your question').fill(question);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
}

test('the chat does not use tools until asked to', async ({ page }) => {
  const { posts } = await stubAgent(page, searchTurn());
  await page.goto('/en');

  await expect(page.getByLabel('Use tools')).not.toBeChecked();
  expect(posts).toHaveLength(0);
});

test('AC2: a tool call shows its name and status', async ({ page }) => {
  await stubAgent(page, searchTurn());
  await page.goto('/en');

  await askWithTools(page, 'How do I verify a webhook signature?');

  await expect(page.getByText('search_docs')).toBeVisible();
  await expect(page.getByText('Done')).toBeVisible();
});

test('AC2: the step is collapsed until asked, then shows input and output', async ({ page }) => {
  // A tool result is often hundreds of lines; a transcript that dumps all of
  // it buries the answer the reader came for.
  await stubAgent(page, searchTurn());
  await page.goto('/en');
  await askWithTools(page, 'q');

  await expect(page.getByText('Input')).toBeHidden();

  await page.getByRole('button', { name: 'Show what search_docs did' }).click();

  await expect(page.getByText('Input')).toBeVisible();
  await expect(page.getByText(/HMAC-SHA256/)).toBeVisible();
});

test('the answer still renders below the tool steps', async ({ page }) => {
  await stubAgent(page, searchTurn());
  await page.goto('/en');

  await askWithTools(page, 'q');

  await expect(page.getByText(/Compare an HMAC/)).toBeVisible();
});

test('AC7: a proposed ticket is shown in full before anything is created', async ({ page }) => {
  // Approving something unseen is not approval.
  await stubAgent(page, approvalTurn());
  await page.goto('/en');

  await askWithTools(page, 'Open a ticket about the retry schedule');

  await expect(page.getByText('Create this ticket?')).toBeVisible();
  await expect(page.getByText(PROPOSAL.title)).toBeVisible();
  await expect(page.getByText(PROPOSAL.body)).toBeVisible();
  await expect(page.getByText('docs')).toBeVisible();
  await expect(page.getByText('Needs your approval')).toBeVisible();
});

test('AC9: denying sends a denial, and nothing is approved', async ({ page }) => {
  const { posts } = await stubAgent(page, approvalTurn());
  await page.goto('/en');
  await askWithTools(page, 'Open a ticket');

  await page.getByRole('button', { name: 'No, thanks' }).click();

  // The answer reaches the server, and says it was a denial. That the server
  // then creates nothing is the API e2e suite's assertion, by row count.
  await expect.poll(() => posts.length, { timeout: 5_000 }).toBeGreaterThan(1);

  expect(JSON.stringify(posts)).toContain('approval-1');
  expect(JSON.stringify(posts)).not.toContain('"approved":true');
});

test('AC8: approving sends an approval', async ({ page }) => {
  const { posts } = await stubAgent(page, approvalTurn());
  await page.goto('/en');
  await askWithTools(page, 'Open a ticket');

  await page.getByRole('button', { name: 'Create it' }).click();

  await expect.poll(() => posts.length, { timeout: 5_000 }).toBeGreaterThan(1);

  expect(JSON.stringify(posts)).toContain('"approved":true');
});

test('AC14: the agent interface is localised in pt-BR', async ({ page }) => {
  await stubAgent(page, approvalTurn());
  await page.goto('/pt-BR');

  await page.getByLabel('Usar ferramentas').check();
  await page.getByLabel('Sua pergunta').fill('Abra um chamado');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();

  await expect(page.getByText('Criar este chamado?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar', exact: true })).toBeVisible();
  await expect(page.getByText('Precisa da sua aprovação')).toBeVisible();
});

test('AC13: the agent interface has no detectable accessibility violations', async ({ page }) => {
  await stubAgent(page, approvalTurn());
  await page.goto('/en');
  await askWithTools(page, 'Open a ticket');
  await expect(page.getByText('Create this ticket?')).toBeVisible();

  const { violations } = await new AxeBuilder({ page }).analyze();

  expect(violations).toEqual([]);
});
