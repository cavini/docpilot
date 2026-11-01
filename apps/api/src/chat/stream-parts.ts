import { type Citation } from './citations.js';

/**
 * Custom data parts the chat stream writes alongside the text.
 *
 * The AI SDK's UI message stream carries typed data parts beside the text, so
 * the client gets structured information without a second request and without
 * parsing it back out of the answer. Two are used:
 *
 * - **`data-conversation`**, written first on every stream. A client that
 *   started a new conversation has no id until the server makes one, and
 *   returning it in a header would not survive the client's own retry logic.
 * - **`data-citations`**, written after retrieval and **before any text**.
 *   The passages are known before generation starts, so the sources panel can
 *   render while the answer is still being written and a citation chip is
 *   clickable the moment its marker appears.
 */
export const STREAM_PARTS = {
  conversation: 'data-conversation',
  citations: 'data-citations',
  budget: 'data-budget',
} as const;

/** Payload of the `data-conversation` part. */
export interface ConversationPart {
  conversationId: string;
}

/** Payload of the `data-citations` part. */
export interface CitationsPart {
  citations: Citation[];
}

/**
 * Payload of the `data-budget` part.
 *
 * Sent only when the day's spend ceiling has been reached and the answer is
 * coming from the mock. Sent before any text, so the interface can say so
 * above the answer rather than correcting itself afterwards.
 */
export interface BudgetPart {
  /** Always true. The part is absent when a real provider answered. */
  degraded: true;
  /** When the ceiling lifts, as an ISO instant. */
  resetsAt: string | null;
}
