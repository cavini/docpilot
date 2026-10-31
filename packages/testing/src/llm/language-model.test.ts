import { streamText } from 'ai';
import { describe, expect, it } from 'vitest';

import { createScriptedLanguageModel } from './language-model';

/** Drains a text stream into the pieces it arrived in. */
async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const pieces: string[] = [];

  for await (const piece of stream) {
    pieces.push(piece);
  }

  return pieces;
}

describe('createScriptedLanguageModel', () => {
  it('returns what it was scripted to return', async () => {
    const model = createScriptedLanguageModel([{ text: 'Tokens last an hour [1].' }]);

    const result = streamText({ model, prompt: 'how long?' });

    expect((await collect(result.textStream)).join('')).toBe('Tokens last an hour [1].');
  });

  it('streams in more than one piece, so progressive rendering can be asserted', async () => {
    // A single-chunk mock would make "arrives in more than one chunk" pass
    // vacuously, which is the assertion the streaming feature exists for.
    const model = createScriptedLanguageModel([{ text: 'one two three four' }]);

    const result = streamText({ model, prompt: 'q' });

    expect((await collect(result.textStream)).length).toBeGreaterThan(1);
  });

  it('honours an explicit chunking', async () => {
    const model = createScriptedLanguageModel([{ text: 'abc', chunks: ['a', 'b', 'c'] }]);

    const result = streamText({ model, prompt: 'q' });

    expect(await collect(result.textStream)).toEqual(['a', 'b', 'c']);
  });

  it('reports the usage it was told to', async () => {
    const model = createScriptedLanguageModel([
      { text: 'hello', inputTokens: 1_234, outputTokens: 56 },
    ]);

    const result = streamText({ model, prompt: 'q' });
    await collect(result.textStream);

    const usage = await result.usage;

    expect(usage.inputTokens).toBe(1_234);
    expect(usage.outputTokens).toBe(56);
  });

  it('can be told to fail part-way, which no real provider can be asked to do', async () => {
    const model = createScriptedLanguageModel([{ text: 'one two three four five', failAfter: 2 }]);

    const result = streamText({ model, prompt: 'q' });
    const before = await collect(result.textStream);

    // The pieces that arrived before the failure are kept: a partial answer is
    // still something the reader read.
    expect(before.join('')).toBe('one two ');
  });

  it('consumes responses in order', async () => {
    const model = createScriptedLanguageModel([{ text: 'first' }, { text: 'second' }]);

    const one = streamText({ model, prompt: 'q' });
    expect((await collect(one.textStream)).join('')).toBe('first');

    const two = streamText({ model, prompt: 'q' });
    expect((await collect(two.textStream)).join('')).toBe('second');
  });

  it('repeats the last response once the script runs out', async () => {
    // An unexpected extra call gets a sensible answer rather than an
    // inscrutable undefined.
    const model = createScriptedLanguageModel([{ text: 'only' }]);

    streamText({ model, prompt: 'q' });
    const second = streamText({ model, prompt: 'q' });

    expect((await collect(second.textStream)).join('')).toBe('only');
  });

  it('calls a tool when scripted to, which no real model can be made to do', async () => {
    // A real model decides for itself whether to call a tool, which is
    // exactly what a test asserting "the step limit stops it" cannot depend
    // on.
    const model = createScriptedLanguageModel([
      { text: '', toolCall: { toolName: 'search_docs', input: { query: 'tokens' } } },
    ]);

    const result = streamText({ model, prompt: 'q' });
    await collect(result.textStream);

    const calls = await result.toolCalls;

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ toolName: 'search_docs' });
  });

  it('finishes a tool call with "tool-calls", so the loop runs another step', async () => {
    const model = createScriptedLanguageModel([
      { text: '', toolCall: { toolName: 'search_docs', input: { query: 'x' } } },
    ]);

    const result = streamText({ model, prompt: 'q' });
    await collect(result.textStream);

    expect(await result.finishReason).toBe('tool-calls');
  });

  it('streams nothing for empty text, rather than one empty chunk', async () => {
    const model = createScriptedLanguageModel([{ text: '' }]);

    const result = streamText({ model, prompt: 'q' });

    expect(await collect(result.textStream)).toEqual([]);
  });
});
