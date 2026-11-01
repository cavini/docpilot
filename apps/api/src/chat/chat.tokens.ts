import { type ScriptedResponse } from '@docpilot/testing';

import { type ResolvedChatModel } from '../llm/provider.factory.js';

/** Options for one call to a {@link ChatModelFactory}. */
export interface ChatModelOptions {
  /**
   * Answer from the mock regardless of `LLM_PROVIDER`.
   *
   * Set when the day's spend ceiling has been reached. Passed per call rather
   * than read inside the factory so the reason a call was degraded is visible
   * where the decision was made, and so the factory stays synchronous.
   */
  forceMock?: boolean;
}

/**
 * Builds the chat model for one call.
 *
 * A factory rather than the model itself, so a test can decide per call what
 * the model should answer. Asserting that an invented citation is stripped
 * requires a model that invents one on demand, which no real provider will do.
 */
export type ChatModelFactory = (
  mockScript?: string | ScriptedResponse[],
  options?: ChatModelOptions,
) => ResolvedChatModel;

/** Injection token for {@link ChatModelFactory}. */
export const CHAT_MODEL_FACTORY = Symbol('DOCPILOT_CHAT_MODEL_FACTORY');
