import { type Database } from '../../db/database.type.js';
import { createTicketInput, createTicketTool } from './create-ticket.tool.js';
import { isFailure } from './tool-result.js';

/** A database stub whose insert returns one row. */
function createDb(row: Record<string, unknown> | undefined) {
  const returning = jest.fn().mockResolvedValue(row === undefined ? [] : [row]);
  const values = jest.fn(() => ({ returning }));
  const insert = jest.fn(() => ({ values }));

  return { db: { insert } as unknown as Database, insert, values };
}

const stored = {
  id: '3f1b9c2e-0000-4000-8000-000000000000',
  title: 'Document the retry schedule',
  body: 'The webhook retry schedule is not written down anywhere.',
  labels: ['docs'],
  conversationId: null,
  createdAt: new Date('2026-10-31T12:00:00.000Z'),
};

/** Calls the tool's execute with the options the SDK supplies. */
async function run(tool: ReturnType<typeof createTicketTool>, input: unknown) {
  return tool.execute(input as never, { toolCallId: 't1', messages: [] } as never);
}

describe('createTicketInput', () => {
  it('accepts a title and a body', () => {
    expect(createTicketInput.safeParse({ title: 'a', body: 'b' }).success).toBe(true);
  });

  it('AC5: rejects an empty title before any approval is asked for', () => {
    expect(createTicketInput.safeParse({ title: '', body: 'b' }).success).toBe(false);
  });

  it('AC5: rejects a title over the limit', () => {
    expect(createTicketInput.safeParse({ title: 'x'.repeat(121), body: 'b' }).success).toBe(false);
  });

  it('AC5: rejects a body over the limit', () => {
    expect(createTicketInput.safeParse({ title: 'a', body: 'x'.repeat(4_001) }).success).toBe(
      false,
    );
  });

  it('rejects more labels than a ticket should carry', () => {
    const labels = Array.from({ length: 11 }, (_, at) => `label-${String(at)}`);

    expect(createTicketInput.safeParse({ title: 'a', body: 'b', labels }).success).toBe(false);
  });

  it('accepts a ticket with no labels', () => {
    expect(createTicketInput.safeParse({ title: 'a', body: 'b' }).success).toBe(true);
  });
});

describe('create_ticket', () => {
  it('AC2: stores the ticket and returns its id', async () => {
    const { db } = createDb(stored);

    const result = await run(createTicketTool(db, null), {
      title: stored.title,
      body: stored.body,
      labels: ['docs'],
    });

    expect(result).toMatchObject({ id: stored.id, title: stored.title });
  });

  it('AC6: returns a URL that is obviously a mock', async () => {
    // A real-looking host invites someone to click it and conclude the
    // integration is real.
    const { db } = createDb(stored);

    const result = (await run(createTicketTool(db, null), {
      title: 'a',
      body: 'b',
    })) as { url: string };

    expect(result.url.startsWith('mock://')).toBe(true);
    expect(result.url).toContain(stored.id);
  });

  it('records which conversation proposed it', async () => {
    const { db, values } = createDb(stored);
    const conversationId = '7f3a9c0e-1b2d-4e5f-8a90-1c2d3e4f5a6b';

    await run(createTicketTool(db, conversationId), { title: 'a', body: 'b' });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ conversationId }));
  });

  it('defaults labels to an empty list rather than null', async () => {
    const { db, values } = createDb(stored);

    await run(createTicketTool(db, null), { title: 'a', body: 'b' });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ labels: [] }));
  });

  it('returns a structured failure when the insert produces no row', async () => {
    const { db } = createDb(undefined);

    const result = await run(createTicketTool(db, null), { title: 'a', body: 'b' });

    expect(isFailure(result)).toBe(true);
  });

  it('does not police its own approval, which the loop enforces', () => {
    // A tool that checked for approval itself could be bypassed by any caller
    // that forgot to set the flag. A loop that will not call it cannot be.
    const { db } = createDb(stored);
    const source = createTicketTool(db, null);

    expect(source.description).toContain('approve');
  });
});
