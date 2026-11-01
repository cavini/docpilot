import { describe, expect, it } from 'vitest';

import { parseEvents } from './parse-events';

const item = (path: string) => `data: ${JSON.stringify({ type: 'item', item: { path } })}\n\n`;

describe('parseEvents', () => {
  it('reads one complete event', () => {
    const { events, rest } = parseEvents(item('/a'));

    expect(events).toEqual([{ type: 'item', item: { path: '/a' } }]);
    expect(rest).toBe('');
  });

  it('reads several events from one chunk', () => {
    const { events } = parseEvents(item('/a') + item('/b'));

    expect(events).toHaveLength(2);
  });

  it('holds back a frame that is still arriving', () => {
    // A chunked response splits wherever the transport decided, which is
    // routinely mid-event.
    const { events, rest } = parseEvents(`${item('/a')}data: {"type":"item","it`);

    expect(events).toHaveLength(1);
    expect(rest).toBe('data: {"type":"item","it');
  });

  it('completes a held-back frame on the next chunk', () => {
    const first = parseEvents(`data: {"type":"item","item":{"pa`);

    expect(first.events).toEqual([]);

    const second = parseEvents(`${first.rest}th":"/a"}}\n\n`);

    expect(second.events).toEqual([{ type: 'item', item: { path: '/a' } }]);
  });

  it('ignores the terminator', () => {
    const { events } = parseEvents(`${item('/a')}data: [DONE]\n\n`);

    expect(events).toHaveLength(1);
  });

  it('skips a malformed frame rather than discarding the ones around it', () => {
    // One bad event should not throw away the rows that already arrived.
    const { events } = parseEvents(`${item('/a')}data: {not json\n\n${item('/b')}`);

    expect(events).toEqual([
      { type: 'item', item: { path: '/a' } },
      { type: 'item', item: { path: '/b' } },
    ]);
  });

  it('ignores a line that is not a data frame', () => {
    const { events } = parseEvents(`: a comment\n\n${item('/a')}`);

    expect(events).toHaveLength(1);
  });

  it('returns nothing for an empty buffer', () => {
    expect(parseEvents('')).toEqual({ events: [], rest: '' });
  });

  it('reads the schema event with its citations', () => {
    const payload = JSON.stringify({
      type: 'schema',
      schema: 'api_endpoints',
      citations: [{ n: 1, chunkId: 'c1' }],
    });

    const { events } = parseEvents(`data: ${payload}\n\n`);

    expect(events[0]).toMatchObject({ type: 'schema', schema: 'api_endpoints' });
  });
});
