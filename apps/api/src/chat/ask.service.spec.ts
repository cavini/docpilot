import { createScriptedLanguageModel } from '@docpilot/testing';

import { type Env } from '../config/env.schema.js';
import { type UsageService } from '../llm/index.js';
import { type RetrievalService, type ScoredChunk } from '../retrieval/index.js';
import { AskService, EmptyAnswerError } from './ask.service.js';
import { DONT_KNOW_ANSWER } from './prompt.js';

const chunk = (n: number): ScoredChunk => ({
  chunkId: `chunk-${String(n)}`,
  documentId: `doc-${String(n)}`,
  documentTitle: 'lumen-api',
  content: `Passage ${String(n)} about authentication.`,
  headingPath: `Lumen API > Section ${String(n)}`,
  pageStart: null,
  pageEnd: null,
  score: 0.03,
  vectorRank: n,
  keywordRank: n,
});

const env = {
  MAX_QUESTION_LENGTH: 1000,
  RETRIEVAL_TOP_K: 8,
  MAX_OUTPUT_TOKENS: 1024,
} as Env;

function createService(options: { results?: ScoredChunk[]; answer?: string } = {}) {
  const results = options.results ?? [chunk(1), chunk(2)];
  const search = jest.fn().mockResolvedValue({ results, tookMs: 5, cached: false });
  const retrieval = { search } as unknown as RetrievalService;
  const usage = { record: jest.fn().mockResolvedValue(undefined) } as unknown as UsageService;
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() };

  const chatModel = jest.fn(() => ({
    model: createScriptedLanguageModel([{ text: options.answer ?? 'Answer [1].' }]),
    provider: 'mock',
    modelId: 'mock-chat',
  }));

  return {
    service: new AskService(env, retrieval, usage, logger as never, chatModel),
    search,
    usage,
    chatModel,
  };
}

describe('AskService', () => {
  it('AC1: returns an answer carrying a citation', async () => {
    const { service } = createService({ answer: 'Tokens last an hour [1].' });

    const result = await service.ask({ question: 'How long do tokens last?' });

    expect(result.answer).toContain('[1]');
    expect(result.citations).toHaveLength(1);
  });

  it('AC2: every citation maps to a passage that was actually retrieved', async () => {
    const { service } = createService({ answer: 'Both [1] and [2] apply.' });

    const result = await service.ask({ question: 'What applies?' });

    expect(result.citations.map((c) => c.chunkId)).toStrictEqual(['chunk-1', 'chunk-2']);
  });

  it('AC3: strips a citation the model invented', async () => {
    // No real provider can be made to invent a citation on demand, which is
    // exactly why the scripted model exists.
    const { service } = createService({ answer: 'A claim [1]. Another [9].' });

    const result = await service.ask({ question: 'What?' });

    expect(result.answer).not.toContain('[9]');
    expect(result.citations.map((c) => c.n)).toStrictEqual([1]);
  });

  it('AC6: passes a refusal through unchanged', async () => {
    const { service } = createService({ answer: DONT_KNOW_ANSWER });

    const result = await service.ask({ question: 'Who won the 1994 World Cup?' });

    expect(result.answer).toBe(DONT_KNOW_ANSWER);
    expect(result.citations).toStrictEqual([]);
  });

  it('AC7: does not call the model at all when retrieval finds nothing', async () => {
    const { service, chatModel } = createService({ results: [] });

    const result = await service.ask({ question: 'Anything?' });

    expect(result.answer).toBe(DONT_KNOW_ANSWER);
    expect(chatModel).not.toHaveBeenCalled();
    expect(result.usage.costUsd).toBe(0);
  });

  it('AC10: passes the document filter through to retrieval', async () => {
    const { service, search } = createService();

    await service.ask({ question: 'What?', documentIds: ['doc-1'] });

    expect(search).toHaveBeenCalledWith(expect.objectContaining({ documentIds: ['doc-1'] }));
  });

  it('AC11: records what the answer cost', async () => {
    const { service, usage } = createService();

    await service.ask({ question: 'What?' });

    expect(usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'chat', provider: 'mock', model: 'mock-chat' }),
    );
  });

  it('AC11b: reports the token usage to the caller', async () => {
    const { service } = createService();

    const result = await service.ask({ question: 'What?' });

    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
  });

  it('AC12: rejects an empty question', async () => {
    const { service } = createService();

    await expect(service.ask({ question: '   ' })).rejects.toThrow(/empty/i);
  });

  it('AC13: rejects a question longer than the limit', async () => {
    const { service } = createService();

    await expect(service.ask({ question: 'x'.repeat(2_000) })).rejects.toThrow(/limit/i);
  });

  it('AC14: raises a typed error when the model returns nothing', async () => {
    const { service } = createService({ answer: '' });

    await expect(service.ask({ question: 'What?' })).rejects.toThrow(EmptyAnswerError);
  });

  it('AC15: cites the passage text, not the heading-prefixed embedding text', async () => {
    const { service } = createService({ answer: 'Answer [1].' });

    const result = await service.ask({ question: 'What?' });

    expect(result.citations[0]?.snippet).toBe('Passage 1 about authentication.');
    expect(result.citations[0]?.headingPath).toBe('Lumen API > Section 1');
  });

  it('asks retrieval for the configured number of passages', async () => {
    const { service, search } = createService();

    await service.ask({ question: 'What?' });

    expect(search).toHaveBeenCalledWith(expect.objectContaining({ topK: 8 }));
  });

  it('honours an explicit topK', async () => {
    const { service, search } = createService();

    await service.ask({ question: 'What?', topK: 3 });

    expect(search).toHaveBeenCalledWith(expect.objectContaining({ topK: 3 }));
  });

  it('ties the usage record to the request that caused it', async () => {
    const { service, usage } = createService();

    await service.ask({ question: 'What?', requestId: 'req-7' });

    expect(usage.record).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'req-7' }));
  });
});
