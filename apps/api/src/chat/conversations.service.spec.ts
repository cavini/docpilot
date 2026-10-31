import { titleFrom } from './conversations.service.js';

describe('titleFrom', () => {
  it('uses the question as written when it is short enough', () => {
    expect(titleFrom('How do I authenticate?')).toBe('How do I authenticate?');
  });

  it('collapses whitespace, so a pasted question does not keep its line breaks', () => {
    expect(titleFrom('How do\n  I   authenticate?')).toBe('How do I authenticate?');
  });

  it('trims surrounding whitespace', () => {
    expect(titleFrom('   padded   ')).toBe('padded');
  });

  it('shortens a long question at a word boundary', () => {
    // Cutting mid-word reads as a rendering bug rather than as a deliberate
    // shortening. The property is that the kept text is a whole-word prefix:
    // what follows it in the original is a space, not more of the same word.
    const question =
      'What is the correct way to verify a webhook signature when the payload has already been parsed and re-serialised by a middleware?';
    const title = titleFrom(question);
    const kept = title.slice(0, -1);

    expect(title.endsWith('…')).toBe(true);
    expect(question.startsWith(kept)).toBe(true);
    expect(question[kept.length]).toBe(' ');
    expect(title.length).toBeLessThanOrEqual(81);
  });

  it('falls back to a hard cut when there is no word boundary to use', () => {
    const title = titleFrom('x'.repeat(200));

    expect(title).toHaveLength(81);
    expect(title.endsWith('…')).toBe(true);
  });

  it('handles an exactly-at-the-limit question without adding an ellipsis', () => {
    const title = titleFrom('a'.repeat(80));

    expect(title).toBe('a'.repeat(80));
  });
});
