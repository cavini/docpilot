import { tool } from 'ai';
import { z } from 'zod';

import { type Database } from '../../db/database.type.js';
import { tickets } from '../../db/schema/index.js';
import { type ToolFailure, fail, withTimeout } from './tool-result.js';

/** Longest title a ticket may have. */
const MAX_TITLE = 120;

/** Longest body a ticket may have. */
const MAX_BODY = 4_000;

/** Most labels a ticket may carry. */
const MAX_LABELS = 10;

/** How long the write may take. */
const TIMEOUT_MS = 10_000;

/**
 * Prefix for the mock ticket URL.
 *
 * Deliberately not a real-looking host. A URL that looks like a genuine
 * tracker invites someone to click it and conclude the integration is real.
 */
const MOCK_URL_PREFIX = 'mock://docpilot/tickets';

/** What the model may propose. */
export const createTicketInput = z.object({
  title: z.string().min(1).max(MAX_TITLE).describe('One line describing the issue.'),
  body: z.string().min(1).max(MAX_BODY).describe('The detail, in Markdown.'),
  labels: z.array(z.string().min(1).max(40)).max(MAX_LABELS).optional(),
});

/** What the tool returns once a ticket is created. */
export interface CreateTicketOutput {
  id: string;
  title: string;
  createdAt: string;
  /** A mock URL, clearly marked as one. */
  url: string;
}

/**
 * Builds the `create_ticket` tool.
 *
 * The only tool that writes, which is why it is the only one gated behind
 * approval. The tracker is a **mock**; what is real is the approval
 * mechanism, and that is the part that would have to be right if the tracker
 * were not.
 *
 * Nothing here checks for approval. That is deliberate: approval is enforced
 * by the agent loop, which does not call `execute` at all until the reader has
 * answered. A tool that policed its own approval could be bypassed by any
 * caller that forgot to; a loop that will not run it cannot be.
 *
 * @param db The database, for the ticket row.
 * @param conversationId Which conversation proposed it, for the audit trail.
 * @returns A tool the agent loop can call once approved.
 */
export function createTicketTool(db: Database, conversationId: string | null) {
  return tool({
    description:
      'Create a ticket describing something that needs fixing or following ' +
      'up. The user is asked to approve it before anything is created, so ' +
      'propose it only when they have asked for one.',
    inputSchema: createTicketInput,
    execute: async (input): Promise<CreateTicketOutput | ToolFailure> =>
      withTimeout('create_ticket', TIMEOUT_MS, async () => {
        const [created] = await db
          .insert(tickets)
          .values({
            title: input.title,
            body: input.body,
            labels: input.labels ?? [],
            conversationId,
          })
          .returning();

        if (!created) {
          return fail('unavailable', 'The ticket could not be created.');
        }

        return {
          id: created.id,
          title: created.title,
          createdAt: created.createdAt.toISOString(),
          url: `${MOCK_URL_PREFIX}/${created.id}`,
        };
      }),
  });
}
