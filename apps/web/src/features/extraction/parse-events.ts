import { type ExtractionEvent } from './extraction.types';

/**
 * Pulls complete server-sent events out of a growing buffer.
 *
 * Separated from the fetching so it can be tested without a network: a
 * chunked response splits wherever the transport decided, which is routinely
 * mid-event and occasionally mid-UTF-8-character.
 *
 * Returns the events it could parse and whatever is left over, which the
 * caller passes back in with the next chunk. An event that does not parse is
 * **skipped rather than thrown**: one malformed frame should not discard the
 * rows that already arrived.
 *
 * @param buffer Everything received and not yet consumed.
 * @returns The complete events, and the unconsumed remainder.
 *
 * @example
 * ```ts
 * const { events, rest } = parseEvents(buffer + chunk);
 * buffer = rest;
 * ```
 */
export function parseEvents(buffer: string): { events: ExtractionEvent[]; rest: string } {
  const events: ExtractionEvent[] = [];
  // An event ends with a blank line. Anything after the last one is a frame
  // still arriving.
  const frames = buffer.split('\n\n');
  const rest = frames.pop() ?? '';

  for (const frame of frames) {
    const line = frame.trim();

    if (!line.startsWith('data: ')) {
      continue;
    }

    const payload = line.slice(6);

    if (payload === '[DONE]') {
      continue;
    }

    try {
      events.push(JSON.parse(payload) as ExtractionEvent);
    } catch {
      // A frame that does not parse is dropped. One malformed event should
      // not discard the rows that already arrived.
    }
  }

  return { events, rest };
}
