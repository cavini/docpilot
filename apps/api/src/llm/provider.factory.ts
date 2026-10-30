import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createDeterministicEmbeddingModel } from '@docpilot/testing';
import { type EmbeddingModel } from 'ai';

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
 * Builds the chat model from configuration.
 *
 * Kept beside the embedding factory so that "which provider are we using" has
 * one answer per concern and both are read from the same validated config.
 *
 * @param env Validated configuration.
 * @returns The provider name and model id, with the model itself.
 * @throws If a real provider is selected without its key.
 */
export function createChatModel(env: Env): { provider: string; modelId: string } {
  if (env.LLM_PROVIDER === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required when LLM_PROVIDER is "anthropic".');
    }

    createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return { provider: 'anthropic', modelId: env.CHAT_MODEL };
  }

  if (env.LLM_PROVIDER === 'openai') {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER is "openai".');
    }

    createOpenAI({ apiKey: env.OPENAI_API_KEY });
    return { provider: 'openai', modelId: env.CHAT_MODEL };
  }

  return { provider: 'mock', modelId: 'mock-chat' };
}
