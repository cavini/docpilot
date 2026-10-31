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
} as const;

/** Payload of the `data-conversation` part. */
export interface ConversationPart {
  conversationId: string;
}

/** Payload of the `data-citations` part. */
export interface CitationsPart {
  citations: Citation[];
}
