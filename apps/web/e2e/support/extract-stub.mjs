/**
 * A tiny server that streams an extraction, for the browser end-to-end suite.
 *
 * Playwright's request interception can only answer with a whole body, so a
 * stubbed route cannot prove that rows appear one at a time — the test would
 * pass just as happily if the table filled in a single frame at the end. This
 * serves the events over a real socket, with a real gap between them, so the
 * criterion is tested rather than assumed.
 *
 * It answers only the extraction endpoints. Everything else the suite needs is
 * intercepted in the specs, which is cheaper and keeps each test's stub next
 * to the assertions that depend on it.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.EXTRACT_STUB_PORT ?? 3199);

/**
 * How long between rows.
 *
 * Comfortably longer than a poll-and-render cycle, so a test that looks for
 * one row while two more are still coming reliably finds it. Short enough
 * that an extraction still finishes in under two seconds.
 */
const GAP_MS = Number(process.env.EXTRACT_STUB_GAP_MS ?? 600);

const schemas = [
  {
    name: 'api_endpoints',
    title: 'API endpoints',
    description: 'Every HTTP endpoint the documents describe.',
    fields: [
      { name: 'method', kind: 'enum', label: 'Method', options: ['GET', 'POST'] },
      { name: 'path', kind: 'string', label: 'Path' },
      { name: 'summary', kind: 'text', label: 'Summary' },
      { name: 'authenticated', kind: 'boolean', label: 'Auth' },
    ],
  },
  {
    name: 'faq_pairs',
    title: 'Questions and answers',
    description: 'Question-and-answer pairs the documents already contain.',
    fields: [
      { name: 'question', kind: 'text', label: 'Question' },
      { name: 'answer', kind: 'text', label: 'Answer' },
    ],
  },
];

const rows = {
  api_endpoints: [
    {
      method: 'POST',
      path: '/auth/token',
      summary: 'Exchange credentials for a token.',
      authenticated: false,
    },
    {
      method: 'GET',
      path: '/invoices',
      summary: 'List invoices for the workspace.',
      authenticated: true,
    },
    { method: 'GET', path: '/invoices/{id}', summary: 'Read one invoice.', authenticated: true },
  ],
  faq_pairs: [{ question: 'How do I authenticate?', answer: 'Call POST /auth/token.' }],
};

const citations = [
  {
    n: 1,
    chunkId: 'c1',
    documentId: 'd1',
    documentTitle: 'lumen-api',
    headingPath: 'Authentication',
  },
  { n: 2, chunkId: 'c2', documentId: 'd2', documentTitle: 'lumen-billing', headingPath: null },
];

/** Headers the real API sends, so the browser treats this the same way. */
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json', ...cors });
  response.end(JSON.stringify(body));
}

function event(part) {
  return `data: ${JSON.stringify(part)}\n\n`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function stream(request, response, body) {
  const schema = body.schema ?? 'api_endpoints';
  const items = rows[schema] ?? [];

  if (!Object.hasOwn(rows, schema)) {
    json(response, 400, {
      error: { code: 'unknown_schema', message: `No schema named "${schema}".` },
    });

    return;
  }

  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    // Without this a proxy — or Next's own dev server — may buffer the whole
    // stream and hand it over at once, which is the failure being tested for.
    'x-accel-buffering': 'no',
    ...cors,
  });

  response.write(event({ type: 'schema', schema, citations }));

  for (const item of items) {
    await sleep(GAP_MS);

    // A client that has gone away leaves a half-written response behind.
    if (response.writableEnded || response.destroyed) {
      return;
    }

    response.write(event({ type: 'item', item }));
  }

  response.write(event({ type: 'done', dropped: 0, repaired: false, citations }));
  response.write('data: [DONE]\n\n');
  response.end();
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, cors);
    response.end();

    return;
  }

  if (url.pathname === '/health') {
    json(response, 200, { status: 'ok' });

    return;
  }

  if (url.pathname === '/extract/schemas') {
    json(response, 200, { schemas });

    return;
  }

  if (url.pathname === '/extract/stream' && request.method === 'POST') {
    const chunks = [];

    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        void stream(request, response, JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        json(response, 400, { error: { code: 'bad_request', message: 'Body is not JSON.' } });
      }
    });

    return;
  }

  json(response, 404, { error: { code: 'not_found', message: url.pathname } });
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`extract stub listening on ${PORT}\n`);
});
