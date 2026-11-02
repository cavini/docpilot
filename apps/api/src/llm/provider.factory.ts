import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import {
  createDeterministicEmbeddingModel,
  createScriptedLanguageModel,
  type ScriptedResponse,
} from '@docpilot/testing';
import { type EmbeddingModel, type LanguageModel } from 'ai';

import { type Env } from '../config/env.schema.js';

/** Which provider an embedding model came from, for usage accounting. */
export interface ResolvedEmbeddingModel {
  model: EmbeddingModel;
  provider: string;
  modelId: string;
}

/**
 * Builds the embedding model from configuration.
 *
 * `mock` is a first-class mode, not a test hook. It produces deterministic
 * vectors with no key and no network, which is what lets the whole test suite
 * run free and lets someone try the project without an account. Because it is
 * built here, by the same factory as the real providers, business code never
 * asks whether it is running under test — the path that is tested is the path
 * that ships.
 *
 * Embeddings come from OpenAI by default even when Anthropic answers
 * questions: Anthropic publishes no first-party embeddings API, so the two
 * choices are independent and `EMBEDDING_PROVIDER` is separate from
 * `LLM_PROVIDER`.
 *
 * @param env Validated configuration.
 * @returns The model, with the provider and id needed to price its usage.
 * @throws If a real provider is selected without its key. The environment
 *   schema catches this at startup; this is the backstop.
 */
export function createEmbeddingModel(env: Env): ResolvedEmbeddingModel {
  if (env.EMBEDDING_PROVIDER === 'mock') {
    return {
      model: createDeterministicEmbeddingModel(env.EMBEDDING_DIMENSIONS),
      provider: 'mock',
      modelId: 'mock-embedding',
    };
  }

  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to embed with OpenAI.');
  }

  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

  return {
    model: openai.embedding(env.EMBEDDING_MODEL),
    provider: 'openai',
    modelId: env.EMBEDDING_MODEL,
  };
}

/**
 * What the mock provider answers when nothing is scripted.
 *
 * Deliberately says it is canned. Someone running the demo without a key
 * should see the citation plumbing working end to end and be in no doubt that
 * the words came from a stub rather than from a model reading their
 * documents.
 */
export const CANNED_MOCK_ANSWER =
  'This is a canned answer from the mock provider, shown because LLM_PROVIDER ' +
  'is set to "mock". Retrieval and citations are real: the passage below [1] ' +
  'is what a real model would have been given to answer from. Set ' +
  'LLM_PROVIDER and an API key to get a real answer.';

/**
 * What the mock provider does when the agent runs it.
 *
 * Scripted to search once and then answer, so the agent loop can be seen
 * working without a key: the tool step is real, the search it runs is real,
 * and only the decision to run it is scripted.
 *
 * Without this the mock answers directly every time, and `/agent` looks
 * identical to `/chat` — which would hide the one thing M4 added.
 */
export const CANNED_MOCK_AGENT_SCRIPT: ScriptedResponse[] = [
  { text: '', toolCall: { toolName: 'search_docs', input: { query: 'the question' } } },
  {
    text:
      'This is a canned answer from the mock provider. The tool step above is ' +
      'real: the agent searched the documents and the passage it found [1] is ' +
      'what a model would have been given. Only the decision to search was ' +
      'scripted. Set LLM_PROVIDER and an API key for a real one.',
  },
];

/**
 * One obviously-canned item per schema, so `POST /extract` works with no key.
 *
 * Every row says, in its own text, that it came from the mock. That matters
 * more here than anywhere else: a canned *answer* that reads as canned is
 * harmless, but canned *extracted data* presented as extracted is exactly the
 * fabrication this product exists to prevent. So the fabrication announces
 * itself.
 *
 * The retrieval, the validation, the deduplication, the streaming and the
 * table are all real; only the items are stubs.
 */
/*
 * Placeholder rows for the mock provider.
 *
 * They used to explain themselves - "LLM_PROVIDER is mock, set a real
 * provider" written into a `summary` column - which is the right content for
 * a developer reading a terminal and the wrong content for a table. A reader
 * who does not know what an environment variable is sees a row of data that
 * makes no sense, with nothing saying it is not data.
 *
 * The explanation moved to where it belongs: the stream reports `degraded`,
 * and the interface says so above the table in a sentence. These rows are
 * now plainly shaped like the real thing and plainly marked `example`, so
 * they read as a sample of the format rather than as a malfunction.
 */
const CANNED_MOCK_ITEMS: Record<string, unknown[]> = {
  api_endpoints: [
    {
      method: 'POST',
      path: '/example/endpoint',
      summary: 'An example row, showing the shape a real extraction returns.',
      authenticated: true,
    },
  ],
  document_outline: [
    {
      level: 1,
      heading: 'Example heading',
      gist: 'An example row, showing the shape a real extraction returns.',
    },
  ],
  faq_pairs: [
    {
      question: 'What does an extracted row look like?',
      answer: 'Like this one - an example, showing the shape a real extraction returns.',
    },
  ],
};

/**
 * What the mock provider returns for an extraction.
 *
 * `Output.array` reads the model's text and parses it, so the script answers
 * with the JSON a constrained provider would have produced.
 *
 * @param schema Which schema is being extracted.
 * @returns A script the mock model can follow.
 */
export function cannedMockExtraction(schema: string): ScriptedResponse[] {
  return [{ text: JSON.stringify({ elements: CANNED_MOCK_ITEMS[schema] ?? [] }) }];
}

/** A chat model, with the provider and id needed to price its usage. */
export interface ResolvedChatModel {
  model: LanguageModel;
  provider: string;
  modelId: string;
}

/**
 * Builds the chat model from configuration.
 *
 * Beside the embedding factory so that "which provider are we using" has one
 * answer per concern, both read from the same validated config.
 *
 * The `mock` model returns a fixed answer. It exists so the whole answer path
 * — retrieval, prompt assembly, citation resolution, usage accounting — is
 * exercised with no key, no cost and no variability. A test asserting that an
 * invented citation is stripped cannot be written against a real model,
 * because a real model cannot be made to invent one on demand.
 *
 * @param env Validated configuration.
 * @param mockScript What the mock model should do: a single answer, or a
 *   script of responses for a loop that takes several steps. Defaults to a
 *   canned sentence citing the first passage, so running the whole product
 *   with no API key produces a complete, obviously-canned answer rather than
 *   an error. Tests pass their own.
 * @returns The model, with the provider and id needed to price its usage.
 * @throws If a real provider is selected without its key.
 */
export function createChatModel(
  env: Env,
  mockScript: string | ScriptedResponse[] = CANNED_MOCK_ANSWER,
  options: { forceMock?: boolean } = {},
): ResolvedChatModel {
  if (options.forceMock === true) {
    // The day's spend ceiling has been reached. Falling through to the mock
    // below rather than throwing, because a demo that still streams, cites
    // and shows its tool steps is worth more than an error page - and the
    // canned text says what it is.
    return mockChatModel(mockScript);
  }

  if (env.LLM_PROVIDER === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required when LLM_PROVIDER is "anthropic".');
    }

    const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return {
      model: anthropic(env.CHAT_MODEL),
      provider: 'anthropic',
      modelId: env.CHAT_MODEL,
    };
  }

  if (env.LLM_PROVIDER === 'openai') {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER is "openai".');
    }

    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    return { model: openai(env.CHAT_MODEL), provider: 'openai', modelId: env.CHAT_MODEL };
  }

  return mockChatModel(mockScript);
}

/**
 * The deterministic model, however it was arrived at.
 *
 * Shared by the `mock` provider and by the spend ceiling, so a degraded
 * answer is indistinguishable from a locally mocked one - including in the
 * usage ledger, where both record as provider `mock` costing nothing.
 *
 * @param mockScript What it should answer.
 * @returns The model, priced as free.
 */
function mockChatModel(mockScript: string | ScriptedResponse[]): ResolvedChatModel {
  return {
    model: createScriptedLanguageModel(
      typeof mockScript === 'string' ? [{ text: mockScript }] : mockScript,
    ),
    provider: 'mock',
    modelId: 'mock-chat',
  };
}
