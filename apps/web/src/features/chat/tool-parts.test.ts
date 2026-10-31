import { type UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { proposedTicketOf, toolCallsOf } from './tool-parts';

/** Builds a message carrying the given parts. */
function message(parts: unknown[]): UIMessage {
  return { id: 'm1', role: 'assistant', parts } as unknown as UIMessage;
}

describe('toolCallsOf', () => {
  it('AC2: reads a finished call, with its name, input and output', () => {
    const calls = toolCallsOf(
      message([
        {
          type: 'tool-search_docs',
          toolCallId: 'c1',
          state: 'output-available',
          input: { query: 'tokens' },
          output: { results: [] },
        },
      ]),
    );

    expect(calls).toEqual([
      {
        toolCallId: 'c1',
        name: 'search_docs',
        status: 'done',
        input: '{\n  "query": "tokens"\n}',
        output: '{\n  "results": []\n}',
      },
    ]);
  });

  it('ignores parts that are not tool calls', () => {
    expect(toolCallsOf(message([{ type: 'text', text: 'hello' }]))).toEqual([]);
  });

  it('reads a dynamic tool the same way', () => {
    const calls = toolCallsOf(
      message([
        {
          type: 'dynamic-tool',
          toolName: 'whatever',
          toolCallId: 'c1',
          state: 'output-available',
          output: {},
        },
      ]),
    );

    expect(calls[0]).toMatchObject({ name: 'whatever', status: 'done' });
  });

  it.each([
    ['input-streaming', 'running'],
    ['input-available', 'running'],
    ['approval-requested', 'awaiting-approval'],
    ['approval-responded', 'running'],
    ['output-available', 'done'],
    ['output-error', 'failed'],
    ['output-denied', 'denied'],
  ])('maps %s to %s', (state, expected) => {
    const calls = toolCallsOf(
      message([{ type: 'tool-x', toolCallId: 'c1', state, approval: { id: 'a1' } }]),
    );

    expect(calls[0]?.status).toBe(expected);
  });

  it('AC5: shows a structured failure as failed, not as a successful call', () => {
    // The tools return errors as data so the model can act on them. The
    // interface should not repeat the model's job of noticing.
    const calls = toolCallsOf(
      message([
        {
          type: 'tool-summarize_document',
          toolCallId: 'c1',
          state: 'output-available',
          output: { ok: false, code: 'not_found', message: 'no such document' },
        },
      ]),
    );

    expect(calls[0]?.status).toBe('failed');
  });

  it('does not mistake an output with no ok field for a failure', () => {
    const calls = toolCallsOf(
      message([
        { type: 'tool-x', toolCallId: 'c1', state: 'output-available', output: { results: [] } },
      ]),
    );

    expect(calls[0]?.status).toBe('done');
  });

  it('prefers the error text over the output when the call errored', () => {
    const calls = toolCallsOf(
      message([
        {
          type: 'tool-x',
          toolCallId: 'c1',
          state: 'output-error',
          errorText: 'the tool blew up',
        },
      ]),
    );

    expect(calls[0]?.output).toBe('the tool blew up');
  });

  it('AC7: carries the approval id only while one is outstanding', () => {
    const pending = toolCallsOf(
      message([
        {
          type: 'tool-create_ticket',
          toolCallId: 'c1',
          state: 'approval-requested',
          input: {},
          approval: { id: 'approval-1' },
        },
      ]),
    );
    const answered = toolCallsOf(
      message([
        { type: 'tool-create_ticket', toolCallId: 'c1', state: 'output-denied', input: {} },
      ]),
    );

    expect(pending[0]?.approvalId).toBe('approval-1');
    expect(answered[0]?.approvalId).toBeUndefined();
  });

  it('keeps calls in the order they were made', () => {
    const calls = toolCallsOf(
      message([
        { type: 'tool-a', toolCallId: 'c1', state: 'output-available', output: {} },
        { type: 'text', text: 'between' },
        { type: 'tool-b', toolCallId: 'c2', state: 'output-available', output: {} },
      ]),
    );

    expect(calls.map((call) => call.name)).toEqual(['a', 'b']);
  });

  it('omits the input while it is still streaming', () => {
    const calls = toolCallsOf(
      message([{ type: 'tool-x', toolCallId: 'c1', state: 'input-streaming' }]),
    );

    expect(calls[0]?.input).toBeUndefined();
  });
});

describe('proposedTicketOf', () => {
  const call = { toolCallId: 'c1', name: 'create_ticket', status: 'awaiting-approval' } as const;

  it('AC7: reads the title, body and labels the model proposed', () => {
    const proposal = proposedTicketOf({
      ...call,
      input: JSON.stringify({ title: 'A title', body: 'A body', labels: ['docs'] }),
    });

    expect(proposal).toEqual({ title: 'A title', body: 'A body', labels: ['docs'] });
  });

  it('defaults labels to an empty list', () => {
    const proposal = proposedTicketOf({
      ...call,
      input: JSON.stringify({ title: 'A title', body: 'A body' }),
    });

    expect(proposal?.labels).toEqual([]);
  });

  it('drops a label that is not a string', () => {
    const proposal = proposedTicketOf({
      ...call,
      input: JSON.stringify({ title: 't', body: 'b', labels: ['ok', 7] }),
    });

    expect(proposal?.labels).toEqual(['ok']);
  });

  it('returns null for input that does not describe a ticket', () => {
    // The input comes from a model, so "not the shape we hoped" is normal -
    // and showing a blank where the title should be, just before asking for
    // approval, is worse than showing nothing.
    expect(proposedTicketOf({ ...call, input: JSON.stringify({ nope: true }) })).toBeNull();
  });

  it('returns null for input that is not JSON', () => {
    expect(proposedTicketOf({ ...call, input: 'half a json objec' })).toBeNull();
  });

  it('returns null while the input is still streaming', () => {
    expect(proposedTicketOf(call)).toBeNull();
  });
});
