import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Answer } from './answer';
import { type Citation } from './citation.types';

const citation = (n: number, title = 'lumen-api'): Citation => ({
  n,
  chunkId: `chunk-${String(n)}`,
  documentId: `doc-${String(n)}`,
  documentTitle: title,
  headingPath: 'Lumen API > Authentication',
  pageStart: null,
  pageEnd: null,
  snippet: 'Call POST /auth/token…',
});

describe('Answer', () => {
  it('AC1: renders a citation marker as a pressable chip', () => {
    render(<Answer text="Tokens last an hour [1]." citations={[citation(1)]} onCite={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Source 1: lumen-api' })).toBeVisible();
  });

  it('AC2: reports which citation was pressed', async () => {
    const onCite = vi.fn();
    render(<Answer text="Tokens last an hour [1]." citations={[citation(1)]} onCite={onCite} />);

    await userEvent.click(screen.getByRole('button'));

    expect(onCite).toHaveBeenCalledWith(1);
  });

  it('AC9: renders the same number cited twice as two chips', () => {
    render(<Answer text="First [1]. Also [1]." citations={[citation(1)]} onCite={vi.fn()} />);

    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('AC8: renders no chips for an answer with no citations', () => {
    render(
      <Answer
        text="I do not know based on the provided documents."
        citations={[]}
        onCite={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('leaves a marker with no matching citation as plain text', () => {
    // The server already strips the ones it invented, so one arriving here
    // means something is wrong. Visible beats silently removed twice.
    render(<Answer text="Claim [9]." citations={[citation(1)]} onCite={vi.fn()} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/\[9\]/)).toBeVisible();
  });

  it('AC12: does not turn an array index in a code block into a chip', () => {
    const text = ['Use it like this:', '', '```ts', 'const first = items[1];', '```'].join('\n');
    const { container } = render(<Answer text={text} citations={[citation(1)]} onCite={vi.fn()} />);

    expect(screen.queryByRole('button')).toBeNull();
    // Asserted on the block's text content, not with a text matcher: the
    // highlighter splits a line across several spans, so no single node holds
    // the whole expression.
    expect(container.querySelector('pre')?.textContent).toContain('items[1]');
  });

  it('highlights a code block', () => {
    const text = ['```ts', 'const first = 1;', '```'].join('\n');
    const { container } = render(<Answer text={text} citations={[]} onCite={vi.fn()} />);

    expect(container.querySelector('code')).toHaveClass('hljs');
    expect(container.querySelector('.hljs-keyword')).not.toBeNull();
  });

  it('AC11: strips raw HTML, which arrives from documents a user uploaded', () => {
    const { container } = render(
      <Answer
        text={'Safe. <img src=x onerror="alert(1)"> <script>alert(2)</script>'}
        citations={[]}
        onCite={vi.fn()}
      />,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('AC11: gives links rel="noopener noreferrer"', () => {
    const { container } = render(
      <Answer text="See [the docs](https://example.com)." citations={[]} onCite={vi.fn()} />,
    );
    const link = container.querySelector('a');

    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders markdown structure rather than literal syntax', () => {
    const { container } = render(
      <Answer text={'## Heading\n\n- one\n- two'} citations={[]} onCite={vi.fn()} />,
    );

    expect(container.querySelector('h2')).toHaveTextContent('Heading');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('replaces markers inside a list item, not only in paragraphs', () => {
    render(<Answer text={'- First point [1]'} citations={[citation(1)]} onCite={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Source 1: lumen-api' })).toBeVisible();
  });

  it('renders a table, so a documentation answer keeps its structure', () => {
    const text = ['| Header | Meaning |', '| --- | --- |', '| `a` | first |'].join('\n');
    const { container } = render(<Answer text={text} citations={[]} onCite={vi.fn()} />);

    expect(container.querySelector('table')).not.toBeNull();
  });

  it('renders a partial answer mid-stream without throwing on broken markdown', () => {
    // Text arrives a word at a time, so every intermediate state is rendered -
    // including one that ends inside an unclosed code fence.
    expect(() =>
      render(
        <Answer text={'Here is an example:\n\n```ts\nconst a'} citations={[]} onCite={vi.fn()} />,
      ),
    ).not.toThrow();
  });
});
