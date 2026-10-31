import { type MessageRow } from '../db/schema/index.js';

/** One turn, reduced to what the prompt needs. */
export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * How much of the conversation may precede the question, in characters.
 *
 * Characters rather than tokens on purpose. Tokenising the whole history on
 * every turn costs real time for a bound that only has to be approximately
 * right, and the ratio is stable enough — roughly four characters per token —
 * that a generous character budget keeps the prompt comfortably inside the
 * context window. The exact accounting that matters, what the call actually
 * cost, comes back from the provider and is recorded.
 */
export const MAX_HISTORY_CHARS = 12_000;

/** What the history builder produced. */
export interface BuiltHistory {
  turns: HistoryTurn[];
  /** True when older turns were dropped to fit the budget. */
  truncated: boolean;
}

/**
 * Selects the turns to include ahead of a new question.
 *
 * Keeps the **newest** turns and drops the oldest, because recency is what a
 * follow-up refers to: "and what about the other one?" means the other one
 * from a moment ago, not from forty turns back.
 *
 * Turns are kept in pairs where possible. An assistant message without the
 * question it answered reads as the model asserting something unprompted, and
 * models follow a malformed transcript surprisingly literally.
 *
 * Summarising the dropped turns instead would preserve more, at the cost of a
 * model call per turn and the chance of losing the detail that mattered.
 * Dropping is predictable and free; `streaming-chat.md` records that as an
 * open question for the M7 evals to settle rather than a decided one.
 *
 * @param rows The conversation's messages, oldest first.
 * @param budget Character budget. Defaults to {@link MAX_HISTORY_CHARS}.
 * @returns The turns to include, and whether anything was dropped.
 *
 * @example
 * ```ts
 * const { turns, truncated } = buildHistory(rows);
 * ```
 */
export function buildHistory(
  rows: Pick<MessageRow, 'role' | 'content'>[],
  budget = MAX_HISTORY_CHARS,
): BuiltHistory {
  const kept: HistoryTurn[] = [];
  let used = 0;

  for (let at = rows.length - 1; at >= 0; at -= 1) {
    const row = rows[at];

    if (!row) {
      continue;
    }

    const cost = row.content.length;

    if (used + cost > budget) {
      break;
    }

    used += cost;
    kept.unshift({ role: row.role, content: row.content });
  }

  // A leading assistant turn is an answer with its question dropped, which
  // reads as the model asserting something unprompted.
  if (kept[0]?.role === 'assistant') {
    kept.shift();
  }

  return { turns: kept, truncated: kept.length < rows.length };
}

/** Prefix added to the prompt when older turns were dropped. */
export const TRUNCATION_NOTICE =
  'Earlier turns of this conversation have been omitted for length. If the ' +
  'question refers to something not shown, say so rather than guessing.';

/**
 * Renders the kept turns as the conversation section of a prompt.
 *
 * @param history The turns to render, and whether anything was dropped.
 * @returns The rendered conversation, or an empty string for a first question.
 */
export function renderHistory(history: BuiltHistory): string {
  if (history.turns.length === 0) {
    return '';
  }

  const lines = history.turns.map(
    (turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`,
  );

  return [
    ...(history.truncated ? [TRUNCATION_NOTICE, ''] : []),
    'Conversation so far:',
    '',
    ...lines,
  ].join('\n');
}
