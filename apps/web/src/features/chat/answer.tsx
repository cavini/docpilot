'use client';

import { CitationChip } from '@docpilot/ui';
import { type ReactNode, createElement, useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

import { type Citation } from './citation.types';
import { splitCitations } from './split-citations';

/** Props accepted by {@link Answer}. */
export interface AnswerProps {
  /** The answer text, which may still be streaming. */
  text: string;
  /** Citations the answer may refer to. */
  citations: Citation[];
  /** Called with a citation's number when its chip is pressed. */
  onCite: (n: number) => void;
}

/**
 * Replaces citation markers in a run of text with pressable chips.
 *
 * Applied per text node rather than to the whole answer, so markdown
 * structure survives: a marker inside a list item stays inside that list
 * item. Code is never reached, because the renderer below hands code to a
 * different component.
 */
function withCitations(
  text: string,
  citations: Citation[],
  onCite: (n: number) => void,
): ReactNode[] {
  const byNumber = new Map(citations.map((citation) => [citation.n, citation]));
  const segments = splitCitations(text, new Set(byNumber.keys()));

  return segments.map((segment, at) =>
    segment.kind === 'text' ? (
      <span key={at}>{segment.text}</span>
    ) : (
      <CitationChip
        key={at}
        n={segment.n}
        source={byNumber.get(segment.n)?.documentTitle ?? ''}
        onClick={() => {
          onCite(segment.n);
        }}
      />
    ),
  );
}

/** Walks a rendered node tree, replacing markers in every string it finds. */
function mapText(
  children: ReactNode,
  citations: Citation[],
  onCite: (n: number) => void,
): ReactNode {
  if (typeof children === 'string') {
    return withCitations(children, citations, onCite);
  }

  if (Array.isArray(children)) {
    const nodes: ReactNode[] = children as ReactNode[];

    return nodes.map((child, at) =>
      typeof child === 'string' ? (
        <span key={at}>{withCitations(child, citations, onCite)}</span>
      ) : (
        child
      ),
    );
  }

  return children;
}

/**
 * Renders an answer: sanitised markdown, with citation markers as chips.
 *
 * **`rehypeSanitize` is not optional.** The text comes from a model, which
 * was given passages from documents a user uploaded — so raw HTML in an
 * answer is reachable by anyone who can upload a file. The default schema
 * strips script, event handlers and dangerous URLs.
 *
 * Code blocks are highlighted and deliberately **not** scanned for citations:
 * `items[1]` in a sample is an array index, and turning it into a chip would
 * be both wrong and confusing. The server masks code the same way, and the
 * two have to agree.
 *
 * @example
 * ```tsx
 * <Answer text={message.text} citations={citations} onCite={open} />
 * ```
 */
export function Answer({ text, citations, onCite }: AnswerProps): ReactNode {
  /**
   * The element renderers, rebuilt only when the citations or the handler
   * change.
   *
   * **Memoised because react-markdown keys its output by component identity.**
   * Rebuilding this object every render gives every element a new component
   * type, so React unmounts and remounts the entire answer on any state
   * change elsewhere on the page. The visible symptom is subtle — opening the
   * sources panel replaced every citation chip with a new DOM node, so
   * restoring focus to "the chip that opened it" landed on an element that was
   * no longer in the document.
   */
  const components: Components = useMemo(() => {
    /*
     * Only elements that carry prose are listed. Code is deliberately absent:
     * `items[1]` in a sample is an array index, and turning it into a chip
     * would be both wrong and confusing. The server masks code the same way,
     * and the two have to agree or a chip would point at the wrong passage.
     */
    const prose =
      (tag: 'p' | 'li' | 'td' | 'th' | 'h1' | 'h2' | 'h3' | 'h4') =>
      ({ children }: { children?: ReactNode }): ReactNode =>
        createElement(tag, null, mapText(children, citations, onCite));

    return {
      // Links in an answer are as untrusted as the documents they came from.
      a: ({ children, href }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
          {children}
        </a>
      ),
      p: prose('p'),
      li: prose('li'),
      td: prose('td'),
      th: prose('th'),
      h1: prose('h1'),
      h2: prose('h2'),
      h3: prose('h3'),
      h4: prose('h4'),
    };
  }, [citations, onCite]);

  return (
    <div className="prose-docpilot flex flex-col gap-3">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize, rehypeHighlight]}
        components={components}
      >
        {text}
      </Markdown>
    </div>
  );
}
