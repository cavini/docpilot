import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchSchemas, useExtraction } from './use-extraction';

/** One server-sent event, framed as the endpoint writes it. */
function event(part: unknown): string {
  return `data: ${JSON.stringify(part)}\n\n`;
}

/** A streaming response whose body releases `frames` one read at a time. */
function streamed(frames: (string | Uint8Array)[]): Response {
  const queue = [...frames];
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = queue.shift();

      if (next === undefined) {
        controller.close();

        return;
      }

      controller.enqueue(typeof next === 'string' ? new TextEncoder().encode(next) : next);
    },
  });

  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** The JSON body a `fetch` call carried. */
function bodyOf(init: RequestInit | undefined): unknown {
  return typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
}

/** Stubs `fetch` with a single answer. */
function stub(answer: Response | Error | (() => Response)): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() => {
    const value = typeof answer === 'function' ? answer() : answer;

    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  });

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useExtraction', () => {
  it('AC13: appends items in the order they arrive', async () => {
    stub(
      streamed([
        event({ type: 'schema', schema: 'api_endpoints', citations: [] }),
        event({ type: 'item', item: { path: '/one' } }),
        event({ type: 'item', item: { path: '/two' } }),
        event({ type: 'done', dropped: 0 }),
      ]),
    );

    const { result } = renderHook(() => useExtraction());

    act(() => {
      result.current.run('api_endpoints');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('done');
    });
    expect(result.current.items).toEqual([{ path: '/one' }, { path: '/two' }]);
  });

  it('passes the document and the query on when it is given them', async () => {
    const fetchMock = stub(streamed([event({ type: 'done', dropped: 0 })]));
    const { result } = renderHook(() => useExtraction());

    act(() => {
      result.current.run('faq_pairs', { documentId: 'doc-1', query: 'refunds' });
    });

    await waitFor(() => {
      expect(result.current.status).toBe('done');
    });
    expect(bodyOf(fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)).toEqual({
      schema: 'faq_pairs',
      documentId: 'doc-1',
      query: 'refunds',
    });
  });

  it('reads an event split across two reads rather than losing it', async () => {
    const frame = event({ type: 'item', item: { path: '/split' } });

    stub(streamed([frame.slice(0, 12), frame.slice(12), event({ type: 'done', dropped: 0 })]));

    const { result } = renderHook(() => useExtraction());

    act(() => {
      result.current.run('api_endpoints');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('done');
    });
    expect(result.current.items).toEqual([{ path: '/split' }]);
  });

  it('reads a multi-byte character split across two reads', async () => {
    // "Pagamentos — visão geral": the em dash is three bytes, and the split
    // lands inside it. Decoding each read on its own would leave a
    // replacement character in the middle of a word.
    const bytes = new TextEncoder().encode(
      event({ type: 'item', item: { heading: 'Pagamentos — visão geral' } }),
    );
    const at = bytes.indexOf(0xe2) + 1;

    stub(
      streamed([
        bytes.slice(0, at),
        bytes.slice(at),
        new TextEncoder().encode(event({ type: 'done', dropped: 0 })),
      ]),
    );

    const { result } = renderHook(() => useExtraction());

    act(() => {
      result.current.run('document_outline');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('done');
    });
    expect(result.current.items).toEqual([{ heading: 'Pagamentos — visão geral' }]);
  });

  it('AC2: reports the server message when the stream is refused', async () => {
    stub(
      new Response(
        JSON.stringify({ error: { code: 'unknown_schema', message: 'No such shape.' } }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const { result } = renderHook(() => useExtraction());

    act(() => {
      result.current.run('nope');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('failed');
    });
    expect(result.current.error).toBe('No such shape.');
  });

  it('reports an error event mid-stream without discarding what arrived', async () => {
    stub(
      streamed([
        event({ type: 'item', item: { path: '/one' } }),
        event({ type: 'error', message: 'The provider stopped answering.' }),
      ]),
    );

    const { result } = renderHook(() => useExtraction());

    act(() => {
      result.current.run('api_endpoints');
    });

    await waitFor(() => {
      expect(result.current.error).toBe('The provider stopped answering.');
    });

    // What arrived is real; it does not become wrong because the rest failed.
    expect(result.current.items).toEqual([{ path: '/one' }]);
  });

  it('treats a stop as finished, not as a failure', async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    stub(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            async pull(controller) {
              controller.enqueue(
                new TextEncoder().encode(event({ type: 'item', item: { path: '/one' } })),
              );
              await held;
              controller.close();
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    );

    const { result } = renderHook(() => useExtraction());

    act(() => {
      result.current.run('api_endpoints');
    });
    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    act(() => {
      result.current.stop();
    });

    expect(result.current.status).toBe('done');
    expect(result.current.error).toBeNull();
    expect(result.current.items).toEqual([{ path: '/one' }]);
    release?.();
  });

  it('starting again clears what the last run produced', async () => {
    stub(() =>
      streamed([
        event({ type: 'item', item: { path: '/one' } }),
        event({ type: 'done', dropped: 3 }),
      ]),
    );

    const { result } = renderHook(() => useExtraction());

    act(() => {
      result.current.run('api_endpoints');
    });
    await waitFor(() => {
      expect(result.current.dropped).toBe(3);
    });

    act(() => {
      result.current.run('api_endpoints');
    });

    // A second run that showed the first run's rows until its own arrived
    // would show the reader data from a question they have replaced.
    expect(result.current.items).toEqual([]);
    expect(result.current.dropped).toBe(0);

    await waitFor(() => {
      expect(result.current.status).toBe('done');
    });
  });

  it('reports a network failure as a failure', async () => {
    stub(new Error('Failed to fetch'));

    const { result } = renderHook(() => useExtraction());

    act(() => {
      result.current.run('api_endpoints');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('failed');
    });
    expect(result.current.error).toBe('Failed to fetch');
  });
});

describe('fetchSchemas', () => {
  it('AC10: returns what the server published', async () => {
    stub(
      new Response(JSON.stringify({ schemas: [{ name: 'faq_pairs', fields: [] }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(fetchSchemas()).resolves.toEqual([{ name: 'faq_pairs', fields: [] }]);
  });

  it('throws rather than returning an empty list when the server refuses', async () => {
    stub(new Response('nope', { status: 503 }));

    // An empty list and a failed load look the same to a chooser, and only
    // one of them is worth telling the reader about.
    await expect(fetchSchemas()).rejects.toThrow('The schemas could not be loaded.');
  });
});
