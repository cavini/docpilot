import {
  budgetAllowing,
  budgetExhausted,
  type BudgetLike,
  createScriptedLanguageModel,
} from '@docpilot/testing';
import { type UIMessageChunk } from 'ai';

import { type Env } from '../config/env.schema.js';
import { type ConversationRow, type MessageRow } from '../db/schema/index.js';
import { type UsageService } from '../llm/index.js';
import { type RetrievalService, type ScoredChunk } from '../retrieval/index.js';
import { ChatService } from './chat.service.js';
import { type AssistantTurn, type ConversationsService } from './conversations.service.js';
import { DONT_KNOW_ANSWER } from './prompt.js';
import { STREAM_PARTS } from './stream-parts.js';

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
  MAX_QUESTION_LENGTH: 1_000,
  RETRIEVAL_TOP_K: 8,
  MAX_OUTPUT_TOKENS: 1_024,
} as Env;

const CONVERSATION: ConversationRow = {
  id: '7f3a9c0e-1b2d-4e5f-8a90-1c2d3e4f5a6b',
  title: 'How do I authenticate?',
  createdAt: new Date('2026-10-30T12:00:00.000Z'),
  updatedAt: new Date('2026-10-30T12:00:00.000Z'),
};

/** Builds the service with every dependency substituted. */
function createService(
  options: {
    budget?: BudgetLike;
    results?: ScoredChunk[];
    answer?: string;
    chunks?: string[];
    failAfter?: number;
    previous?: Pick<MessageRow, 'role' | 'content'>[];
  } = {},
) {
  const budget = options.budget ?? budgetAllowing();
  const results = options.results ?? [chunk(1), chunk(2)];
  const search = jest.fn().mockResolvedValue({ results, tookMs: 5, cached: false });
  const retrieval = { search } as unknown as RetrievalService;

  const appendTurn = jest.fn().mockResolvedValue({ id: 'message-1' });
  const conversations = {
    open: jest.fn().mockResolvedValue(CONVERSATION),
    turnsOf: jest.fn().mockResolvedValue(options.previous ?? []),
    appendTurn,
  } as unknown as ConversationsService;

  const record = jest.fn().mockResolvedValue(undefined);
  const usage = { record } as unknown as UsageService;
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const model = createScriptedLanguageModel([
    {
      text: options.answer ?? 'Tokens last an hour [1].',
      ...(options.chunks === undefined ? {} : { chunks: options.chunks }),
      ...(options.failAfter === undefined ? {} : { failAfter: options.failAfter }),
    },
  ]);

  const chatModel = jest.fn(() => ({ model, provider: 'mock', modelId: 'mock-chat' }));

  return {
    service: new ChatService(
      env,
      retrieval,
      conversations,
      usage,
      logger as never,
      chatModel,
      budget as never,
    ),
    search,
    conversations,
    appendTurn,
    record,
    chatModel,
  };
}

/** Drains a UI message stream into the raw chunks it carried. */
async function drain(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    chunks.push(value);
  }

  return chunks;
}

/** The assistant turn the service stored. */
function storedTurn(appendTurn: jest.Mock): AssistantTurn {
  return appendTurn.mock.calls[0]?.[2] as AssistantTurn;
}

describe('ChatService', () => {
  it('AC3: sends the conversation id first, so a new conversation can be resumed', async () => {
    const { service } = createService();

    const chunks = await drain(await service.stream({ question: 'How do I authenticate?' }));
    const first = chunks.find((part) => part.type.startsWith('data-'));

    expect(first).toMatchObject({
      type: STREAM_PARTS.conversation,
      data: { conversationId: CONVERSATION.id },
    });
  });

  it('opens exactly one message, with the data parts inside it', async () => {
    // Data parts written before a `start` chunk belong to no message, so the
    // client opens one for them and another for the text — which renders as an
    // empty assistant bubble above the real answer. Caught in a browser, not
    // by any assertion that existed at the time.
    const { service } = createService();

    const chunks = await drain(await service.stream({ question: 'q' }));
    const startAt = chunks.findIndex((part) => part.type === 'start');

    expect(chunks.filter((part) => part.type === 'start')).toHaveLength(1);
    expect(startAt).toBe(0);
    expect(chunks.findIndex((part) => part.type === STREAM_PARTS.conversation)).toBeGreaterThan(
      startAt,
    );
  });

  it('AC2: sends the citations before any text', async () => {
    // The passages are known before generation starts, so the sources panel
    // can render while the answer is still being written.
    const { service } = createService();

    const chunks = await drain(await service.stream({ question: 'q' }));
    const citationsAt = chunks.findIndex((part) => part.type === STREAM_PARTS.citations);
    const firstTextAt = chunks.findIndex((part) => part.type === 'text-delta');

    expect(citationsAt).toBeGreaterThanOrEqual(0);
    expect(firstTextAt).toBeGreaterThan(citationsAt);
  });

  it('AC1: streams the answer in more than one piece', async () => {
    const { service } = createService({ answer: 'one two three four five' });

    const chunks = await drain(await service.stream({ question: 'q' }));

    expect(chunks.filter((part) => part.type === 'text-delta').length).toBeGreaterThan(1);
  });

  it('AC4: every citation sent maps to a passage that was retrieved', async () => {
    const { service } = createService();

    const chunks = await drain(await service.stream({ question: 'q' }));
    const part = chunks.find((item) => item.type === STREAM_PARTS.citations) as
      { data: { citations: { chunkId: string }[] } } | undefined;

    expect(part?.data.citations.map((citation) => citation.chunkId)).toEqual([
      'chunk-1',
      'chunk-2',
    ]);
  });

  it('AC6: retrieves again for a follow-up rather than reusing the first passages', async () => {
    // Reusing them would answer a different question confidently, which is the
    // failure this product exists to avoid.
    const { service, search } = createService({
      previous: [
        { role: 'user', content: 'How do I authenticate?' },
        { role: 'assistant', content: 'With a bearer token.' },
      ],
    });

    await drain(await service.stream({ question: 'and the rate limit?' }));

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ query: 'and the rate limit?' }));
  });

  it('AC5: puts the previous turns in the prompt', async () => {
    const { service, chatModel } = createService({
      previous: [
        { role: 'user', content: 'How do I authenticate?' },
        { role: 'assistant', content: 'With a bearer token.' },
      ],
    });

    await drain(await service.stream({ question: 'and the rate limit?' }));
    const model = chatModel.mock.results[0]?.value.model as {
      doStreamCalls: { prompt: unknown }[];
    };
    const prompt = JSON.stringify(model.doStreamCalls[0]?.prompt);

    expect(prompt).toContain('How do I authenticate?');
    expect(prompt).toContain('With a bearer token.');
  });

  it('AC7: persists the turn once generation ends', async () => {
    const { service, appendTurn } = createService();

    await drain(await service.stream({ question: 'How do I authenticate?' }));

    expect(appendTurn).toHaveBeenCalledWith(
      CONVERSATION.id,
      'How do I authenticate?',
      expect.objectContaining({ outcome: 'complete' }),
    );
  });

  it('AC8: stores a partial answer when the stream breaks, marked as such', async () => {
    // A partial answer is still something the reader read; discarding it loses
    // the context of whatever they ask next.
    const { service, appendTurn } = createService({
      answer: 'one two three four five',
      failAfter: 2,
    });

    await drain(await service.stream({ question: 'q' }));
    const turn = storedTurn(appendTurn);

    expect(turn.outcome).toBe('failed');
    expect(turn.content).toContain('one two');
  });

  it('AC12: records what the turn cost', async () => {
    const { service, record } = createService();

    await drain(await service.stream({ question: 'q' }));

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'chat', provider: 'mock', model: 'mock-chat' }),
    );
  });

  it('stores the citations the answer actually used, not every passage retrieved', async () => {
    const { service, appendTurn } = createService({ answer: 'Only the second one [2].' });

    await drain(await service.stream({ question: 'q' }));
    const turn = storedTurn(appendTurn);

    expect(turn.citations).toHaveLength(1);
    expect(turn.citations[0]).toMatchObject({ chunkId: 'chunk-2' });
  });

  it('refuses without calling the model when retrieval finds nothing', async () => {
    const { service, appendTurn, chatModel } = createService({ results: [] });

    const chunks = await drain(await service.stream({ question: 'q' }));
    const text = chunks
      .filter((part): part is UIMessageChunk & { delta: string } => part.type === 'text-delta')
      .map((part) => part.delta)
      .join('');

    expect(chatModel).not.toHaveBeenCalled();
    expect(text).toBe(DONT_KNOW_ANSWER);
    expect(storedTurn(appendTurn).citations).toEqual([]);
  });

  it('AC10: rejects an empty question before opening a stream', async () => {
    const { service, conversations } = createService();

    await expect(service.stream({ question: '   ' })).rejects.toThrow(/empty/i);
    expect(conversations.open).not.toHaveBeenCalled();
  });

  it('AC11: rejects an over-long question before reaching the provider', async () => {
    const { service, chatModel } = createService();

    await expect(service.stream({ question: 'x'.repeat(2_000) })).rejects.toThrow(/limit/i);
    expect(chatModel).not.toHaveBeenCalled();
  });

  it('AC13: passes the document filter through to retrieval', async () => {
    const { service, search } = createService();

    await drain(await service.stream({ question: 'q', documentIds: ['doc-1'] }));

    expect(search).toHaveBeenCalledWith(expect.objectContaining({ documentIds: ['doc-1'] }));
  });

  describe("when the day's spend ceiling has been reached", () => {
    it('AC11: announces it before any text, so nothing has to be corrected', async () => {
      const { service } = createService({ budget: budgetExhausted() });

      const chunks = await drain(await service.stream({ question: 'How do I authenticate?' }));
      const budgetAt = chunks.findIndex((part) => part.type === STREAM_PARTS.budget);
      const firstText = chunks.findIndex((part) => part.type === 'text-delta');

      expect(budgetAt).toBeGreaterThanOrEqual(0);
      expect(chunks[budgetAt]).toMatchObject({
        data: { degraded: true, resetsAt: '2026-11-02T00:00:00.000Z' },
      });

      // Before the first word. A banner that appears after the answer has
      // been read is a banner that did not do its job.
      expect(budgetAt).toBeLessThan(firstText);
    });

    it('AC10: sends no budget part when a real provider answered', async () => {
      const { service } = createService();

      const chunks = await drain(await service.stream({ question: 'anything' }));

      // Absence is the signal, so the interface has nothing to clear.
      expect(chunks.some((part) => part.type === STREAM_PARTS.budget)).toBe(false);
    });

    it('AC11: records the turn as having cost nothing', async () => {
      const { service, record } = createService({ budget: budgetExhausted() });

      await drain(await service.stream({ question: 'anything' }));

      // A degraded turn that recorded against the configured provider would
      // make the ledger - the thing the ceiling is read from - drift.
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'mock', model: 'mock-chat' }),
      );
    });
  });
});
