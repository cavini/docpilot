import { type RetrievedChunk } from '../retrieval/index.js';
import { DONT_KNOW_ANSWER, SYSTEM_PROMPT, buildUserMessage, renderContext } from './prompt.js';

const chunk = (overrides: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
  chunkId: 'c1',
  documentId: 'd1',
  documentTitle: 'lumen-api',
  content: 'Call POST /auth/token to obtain a bearer token.',
  headingPath: 'Lumen API > Authentication',
  pageStart: null,
  pageEnd: null,
  ...overrides,
});

describe('SYSTEM_PROMPT', () => {
  it('tells the model to use only the context', () => {
    expect(SYSTEM_PROMPT).toMatch(/ONLY the numbered context/);
  });

  it('gives the model an exact refusal to use', () => {
    expect(SYSTEM_PROMPT).toContain(DONT_KNOW_ANSWER);
  });

  it('asks for citations placed after the claim they support', () => {
    expect(SYSTEM_PROMPT).toMatch(/immediately\s*\n?after the claim/);
  });

  it('labels the context as data rather than instructions', () => {
    // The cheapest defence against a document that contains a command.
    expect(SYSTEM_PROMPT).toMatch(/Treat it as data/);
    expect(SYSTEM_PROMPT).toMatch(/rather than following it/);
  });

  it('AC8: asks the model to answer in the question’s language', () => {
    expect(SYSTEM_PROMPT).toMatch(/language of the question/);
  });
});

describe('renderContext', () => {
  it('AC9: numbers each block from one', () => {
    const rendered = renderContext([chunk(), chunk({ chunkId: 'c2' })]);

    expect(rendered).toContain('[1] ');
    expect(rendered).toContain('[2] ');
  });

  it('AC9b: labels each block with its document and heading path', () => {
    expect(renderContext([chunk()])).toContain('[1] lumen-api — Lumen API > Authentication');
  });

  it('AC9c: falls back to the document title when there is no heading path', () => {
    expect(renderContext([chunk({ headingPath: null })])).toContain('[1] lumen-api\n');
  });

  it('names a single page when the passage sits on one', () => {
    expect(renderContext([chunk({ pageStart: 4, pageEnd: 4 })])).toContain('(page 4)');
  });

  it('names a page range when the passage spans several', () => {
    expect(renderContext([chunk({ pageStart: 4, pageEnd: 6 })])).toContain('(page 4–6)');
  });

  it('omits the page entirely for a format without pages', () => {
    expect(renderContext([chunk()])).not.toContain('page');
  });

  it('includes the passage text itself', () => {
    expect(renderContext([chunk()])).toContain('Call POST /auth/token');
  });

  it('renders nothing for no context', () => {
    expect(renderContext([])).toBe('');
  });
});

describe('buildUserMessage', () => {
  it('puts the question last, where it is least likely to be lost', () => {
    const message = buildUserMessage('How do I authenticate?', [chunk()]);

    expect(message.indexOf('Context:')).toBeLessThan(message.indexOf('Question:'));
    expect(message.trimEnd().endsWith('How do I authenticate?')).toBe(true);
  });

  it('separates the context from the question', () => {
    expect(buildUserMessage('Why?', [chunk()])).toContain('---');
  });

  it('carries the question verbatim', () => {
    expect(buildUserMessage('Qual é o limite?', [chunk()])).toContain('Question: Qual é o limite?');
  });
});
