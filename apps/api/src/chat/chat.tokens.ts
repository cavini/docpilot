import { type ScriptedResponse } from '@docpilot/testing';

import { type ResolvedChatModel } from '../llm/provider.factory.js';

/**
 * Builds the chat model for one call.
 *
 * A factory rather than the model itself, so a test can decide per call what
 * the model should answer. Asserting that an invented citation is stripped
 * requires a model that invents one on demand, which no real provider will do.
 */
export type ChatModelFactory = (mockScript?: string | ScriptedResponse[]) => ResolvedChatModel;

/** Injection token for {@link ChatModelFactory}. */
export const CHAT_MODEL_FACTORY = Symbol('DOCPILOT_CHAT_MODEL_FACTORY');
