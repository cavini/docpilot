import { MAX_HISTORY_CHARS, TRUNCATION_NOTICE, buildHistory, renderHistory } from './history.js';

/** Builds a turn of a given length. */
const turn = (role: 'user' | 'assistant', content: string) => ({ role, content });

describe('buildHistory', () => {
  it('AC5: keeps every turn when they fit', () => {
    const rows = [turn('user', 'first'), turn('assistant', 'answer'), turn('user', 'second')];

    expect(buildHistory(rows)).toEqual({
      turns: rows,
      truncated: false,
    });
  });

  it('returns nothing for a first question', () => {
    expect(buildHistory([])).toEqual({ turns: [], truncated: false });
  });

  it('keeps the newest turns and drops the oldest', () => {
    // Recency is what a follow-up refers to: "and what about the other one?"
    // means the other one from a moment ago.
    const rows = [
      turn('user', 'a'.repeat(60)),
      turn('assistant', 'b'.repeat(60)),
      turn('user', 'c'.repeat(60)),
      turn('assistant', 'd'.repeat(60)),
    ];

    const { turns, truncated } = buildHistory(rows, 130);

    expect(truncated).toBe(true);
    expect(turns.map((kept) => kept.content[0])).toEqual(['c', 'd']);
  });

  it('never starts with an assistant turn', () => {
    // An answer whose question was dropped reads as the model asserting
    // something unprompted, which models follow surprisingly literally.
    const rows = [
      turn('user', 'a'.repeat(100)),
      turn('assistant', 'b'.repeat(50)),
      turn('user', 'c'.repeat(50)),
    ];

    const { turns } = buildHistory(rows, 110);

    expect(turns[0]?.role).toBe('user');
  });

  it('reports truncation when a turn was dropped', () => {
    const rows = [turn('user', 'x'.repeat(200)), turn('user', 'y')];

    expect(buildHistory(rows, 50).truncated).toBe(true);
  });

  it('reports no truncation when nothing was dropped', () => {
    expect(buildHistory([turn('user', 'short')], 50).truncated).toBe(false);
  });

  it('drops everything rather than overflowing on one enormous turn', () => {
    const { turns } = buildHistory([turn('user', 'x'.repeat(100))], 10);

    expect(turns).toEqual([]);
  });

  it('has a budget generous enough for a real conversation', () => {
    // Roughly four characters per token, so this is a few thousand tokens of
    // history before the retrieved passages are added.
    expect(MAX_HISTORY_CHARS).toBeGreaterThan(8_000);
  });
});

describe('renderHistory', () => {
  it('renders nothing for a first question, so the prompt has no empty section', () => {
    expect(renderHistory({ turns: [], truncated: false })).toBe('');
  });

  it('labels each turn by who said it', () => {
    const rendered = renderHistory({
      turns: [turn('user', 'How do I authenticate?'), turn('assistant', 'With a bearer token.')],
      truncated: false,
    });

    expect(rendered).toContain('User: How do I authenticate?');
    expect(rendered).toContain('Assistant: With a bearer token.');
  });

  it('says so when turns were dropped, rather than hiding it', () => {
    // Without this the model answers a follow-up about something it cannot
    // see, confidently and wrongly.
    const rendered = renderHistory({
      turns: [turn('user', 'and the other one?')],
      truncated: true,
    });

    expect(rendered).toContain(TRUNCATION_NOTICE);
  });

  it('omits the notice when nothing was dropped', () => {
    const rendered = renderHistory({ turns: [turn('user', 'hello')], truncated: false });

    expect(rendered).not.toContain(TRUNCATION_NOTICE);
  });
});
