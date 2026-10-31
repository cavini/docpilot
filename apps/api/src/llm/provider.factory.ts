import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createDeterministicEmbeddingModel, createScriptedLanguageModel } from '@docpilot/testing';
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
 * @param mockResponse What the mock model should answer. Defaults to a canned
 *   sentence citing the first passage, so that running the whole product with
 *   no API key produces a complete, obviously-canned answer rather than an
 *   error. Tests pass their own.
 * @returns The model, with the provider and id needed to price its usage.
 * @throws If a real provider is selected without its key.
 */
export function createChatModel(env: Env, mockResponse = CANNED_MOCK_ANSWER): ResolvedChatModel {
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

  return {
    model: createScriptedLanguageModel([{ text: mockResponse }]),
    provider: 'mock',
    modelId: 'mock-chat',
  };
}
