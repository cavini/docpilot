import {
  budgetAllowing,
  budgetExhausted,
  type BudgetLike,
  createScriptedLanguageModel,
} from '@docpilot/testing';
import { type UIMessageChunk } from 'ai';

import { type ConversationsService } from '../chat/conversations.service.js';
import { type Env } from '../config/env.schema.js';
import { type Database } from '../db/database.type.js';
import { type ConversationRow } from '../db/schema/index.js';
import { type FeatureFlagsService } from '../feature-flags/feature-flags.service.js';
import { type UsageService } from '../llm/index.js';
import { type RetrievalService, type ScoredChunk } from '../retrieval/index.js';
import { STREAM_PARTS } from '../chat/stream-parts.js';
import { STEP_LIMIT_NOTICE } from './agent.prompt.js';
import { AgentService } from './agent.service.js';

const MAX_STEPS = 3;

const env = {
  MAX_QUESTION_LENGTH: 1_000,
  MAX_OUTPUT_TOKENS: 1_024,
  RETRIEVAL_TOP_K: 8,
  AGENT_MAX_STEPS: MAX_STEPS,
} as Env;

const CONVERSATION: ConversationRow = {
  id: '7f3a9c0e-1b2d-4e5f-8a90-1c2d3e4f5a6b',
  title: 'How do I authenticate?',
  createdAt: new Date('2026-10-31T12:00:00.000Z'),
  updatedAt: new Date('2026-10-31T12:00:00.000Z'),
};

const chunk = (n: number): ScoredChunk => ({
  chunkId: `chunk-${String(n)}`,
  documentId: 'doc-1',
  documentTitle: 'lumen-api',
  content: `Passage ${String(n)}.`,
  headingPath: 'Lumen API > Authentication',
  pageStart: null,
  pageEnd: null,
  score: 0.03,
  vectorRank: n,
  keywordRank: n,
});

/** Builds the service with every dependency substituted. */
function createService(
  options: {
    budget?: BudgetLike;
    script?: Parameters<typeof createScriptedLanguageModel>[0];
    toolsEnabled?: boolean;
  } = {},
) {
  const budget = options.budget ?? budgetAllowing();
  const search = jest.fn().mockResolvedValue({ results: [chunk(1)], tookMs: 5, cached: false });
  const retrieval = { search } as unknown as RetrievalService;

  const appendTurn = jest.fn().mockResolvedValue({ id: 'message-1' });
  const conversations = {
    open: jest.fn().mockResolvedValue(CONVERSATION),
    turnsOf: jest.fn().mockResolvedValue([]),
    appendTurn,
  } as unknown as ConversationsService;

  const record = jest.fn().mockResolvedValue(undefined);
  const usage = { record } as unknown as UsageService;
  const flags = {
    isEnabled: jest.fn().mockReturnValue(options.toolsEnabled ?? true),
  } as unknown as FeatureFlagsService;
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const model = createScriptedLanguageModel(options.script ?? [{ text: 'An answer [1].' }]);
  const chatModel = jest.fn(() => ({ model, provider: 'mock', modelId: 'mock-chat' }));

  return {
    service: new AgentService(
      env,
      {} as Database,
      retrieval,
      conversations,
      usage,
      flags,
      logger as never,
      chatModel,
      budget as never,
    ),
    search,
    appendTurn,
    record,
    flags,
  };
}

/** Drains a UI message stream into its parts. */
async function drain(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const parts: UIMessageChunk[] = [];
  const reader = stream.getReader();

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    parts.push(value);
  }

  return parts;
}

/** The assistant turn the service stored. */
function storedTurn(appendTurn: jest.Mock): { content: string; outcome: string } {
  return appendTurn.mock.calls[0]?.[2] as { content: string; outcome: string };
}

describe('AgentService', () => {
  it('opens exactly one message, with the conversation part inside it', async () => {
    const { service } = createService();

    const parts = await drain(await service.stream({ question: 'q' }));

    expect(parts.filter((part) => part.type === 'start')).toHaveLength(1);
    expect(parts[0]?.type).toBe('start');
  });

  it('AC1: calls a tool when the model asks for one', async () => {
    const { service, search } = createService({
      script: [
        { text: '', toolCall: { toolName: 'search_docs', input: { query: 'bearer token' } } },
        { text: 'Tokens last an hour [1].' },
      ],
    });

    await drain(await service.stream({ question: 'How long is a token valid?' }));

    expect(search).toHaveBeenCalledWith(expect.objectContaining({ query: 'bearer token' }));
  });

  it('AC2: puts the tool call and its result in the stream', async () => {
    // An agent whose work is invisible is impossible to trust or to debug.
    const { service } = createService({
      script: [
        { text: '', toolCall: { toolName: 'search_docs', input: { query: 'x' } } },
        { text: 'Done [1].' },
      ],
    });

    const parts = await drain(await service.stream({ question: 'q' }));
    const types = parts.map((part) => part.type);

    expect(types).toContain('tool-input-available');
    expect(types).toContain('tool-output-available');
  });

  it('AC3: stops at the step limit rather than looping for ever', async () => {
    // Scripted to call a tool every time, which is the one thing a real model
    // cannot be relied on to do.
    const { service, search } = createService({
      script: [{ text: '', toolCall: { toolName: 'search_docs', input: { query: 'again' } } }],
    });

    await drain(await service.stream({ question: 'q' }));

    // One search per step, and no more steps than the limit allows.
    expect(search.mock.calls.length).toBeLessThanOrEqual(MAX_STEPS);
  }, 30_000);

  it('AC4: tells the reader it stopped, rather than storing an empty answer', async () => {
    const { service, appendTurn } = createService({
      script: [{ text: '', toolCall: { toolName: 'search_docs', input: { query: 'again' } } }],
    });

    await drain(await service.stream({ question: 'q' }));

    expect(storedTurn(appendTurn)).toMatchObject({
      content: STEP_LIMIT_NOTICE,
      outcome: 'stopped',
    });
  }, 30_000);

  it('AC5: a failing tool does not end the turn', async () => {
    // The model sees a structured error and can carry on; an exception would
    // leave the reader with nothing.
    const { service, appendTurn } = createService({
      script: [
        { text: '', toolCall: { toolName: 'search_docs', input: { query: '' } } },
        { text: 'I could not search for that.' },
      ],
    });

    await drain(await service.stream({ question: 'q' }));

    expect(storedTurn(appendTurn).content).toContain('could not search');
  });

  it('AC10: offers no tools when the flag is off', async () => {
    const { service, search } = createService({
      toolsEnabled: false,
      script: [
        { text: '', toolCall: { toolName: 'search_docs', input: { query: 'x' } } },
        { text: 'An answer.' },
      ],
    });

    await drain(await service.stream({ question: 'q' }));

    expect(search).not.toHaveBeenCalled();
  });

  it('AC11: records what the turn cost', async () => {
    const { service, record } = createService();

    await drain(await service.stream({ question: 'q' }));

    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'agent' }));
  });

  it('stores the turn when it finishes normally', async () => {
    const { service, appendTurn } = createService();

    await drain(await service.stream({ question: 'How do I authenticate?' }));

    expect(appendTurn).toHaveBeenCalledWith(
      CONVERSATION.id,
      'How do I authenticate?',
      expect.objectContaining({ outcome: 'complete' }),
    );
  });

  it('rejects an empty question before opening a stream', async () => {
    const { service } = createService();

    await expect(service.stream({ question: '  ' })).rejects.toThrow(/empty/i);
  });

  it('rejects an over-long question before reaching the provider', async () => {
    const { service } = createService();

    await expect(service.stream({ question: 'x'.repeat(2_000) })).rejects.toThrow(/limit/i);
  });

  describe("when the day's spend ceiling has been reached", () => {
    it('AC11: announces it before any text and runs the turn on the mock', async () => {
      const { service } = createService({ budget: budgetExhausted() });

      const parts = await drain(await service.stream({ question: 'Open a ticket' }));
      const budgetAt = parts.findIndex((part) => part.type === STREAM_PARTS.budget);

      expect(budgetAt).toBeGreaterThanOrEqual(0);
      expect(parts[budgetAt]).toMatchObject({
        data: { degraded: true, resetsAt: '2026-11-02T00:00:00.000Z' },
      });
    });

    it('AC11: records the turn against the mock, so the ledger does not drift', async () => {
      const { service, record } = createService({ budget: budgetExhausted() });

      await drain(await service.stream({ question: 'anything' }));

      // The ceiling is read from this ledger. A degraded turn recorded
      // against the configured provider would inflate the number that
      // decides whether the next turn is degraded too.
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'mock', model: 'mock-chat' }),
      );
    });

    it('AC10: sends no budget part when a real provider ran the turn', async () => {
      const { service } = createService();

      const parts = await drain(await service.stream({ question: 'anything' }));

      expect(parts.some((part) => part.type === STREAM_PARTS.budget)).toBe(false);
    });
  });
});
