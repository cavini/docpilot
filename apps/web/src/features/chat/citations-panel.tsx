'use client';

import { SidePanel } from '@docpilot/ui';
import { useTranslations } from 'next-intl';
import { type ReactNode } from 'react';

import { type Citation } from './citation.types';

/** Props accepted by {@link CitationsPanel}. */
export interface CitationsPanelProps {
  /** Citations for the answer being read. */
  citations: Citation[];
  /** Which one to show first. Null closes the panel. */
  focused: number | null;
  onClose: () => void;
}

/**
 * Describes where a citation came from.
 *
 * A heading path when the format has one, a page range when it has pages, and
 * the document title alone when it has neither — rather than an empty label
 * beside the title, which reads as a rendering fault.
 */
function sourceLabel(
  citation: Citation,
  t: (key: string, values?: Record<string, string | number>) => string,
): string | null {
  if (citation.headingPath !== null) {
    return citation.headingPath;
  }

  if (citation.pageStart === null) {
    return null;
  }

  return citation.pageEnd === null || citation.pageEnd === citation.pageStart
    ? t('page', { page: citation.pageStart })
    : t('pageRange', { from: citation.pageStart, to: citation.pageEnd });
}

/**
 * The sources behind an answer.
 *
 * The pressed citation comes first, then the rest, so the reader sees what
 * they asked for without losing what else the answer rested on.
 *
 * The passage shown is the chunk's own text, exactly as the API returns it.
 * Showing the heading-prefixed version used for embedding would display
 * something the document does not actually say.
 */
export function CitationsPanel({ citations, focused, onClose }: CitationsPanelProps): ReactNode {
  const t = useTranslations('chat.sources');

  // The pressed one first, the others after, in their own order.
  const ordered =
    focused === null
      ? citations
      : [
          ...citations.filter((citation) => citation.n === focused),
          ...citations.filter((citation) => citation.n !== focused),
        ];

  return (
    <SidePanel open={focused !== null} onClose={onClose} title={t('title')} closeLabel={t('close')}>
      <ol className="flex flex-col gap-5">
        {ordered.map((citation) => {
          const label = sourceLabel(citation, t);

          return (
            <li key={citation.chunkId} className="flex flex-col gap-1">
              <p className="flex items-baseline gap-2">
                <span className="text-accent text-xs font-semibold tabular-nums">
                  [{citation.n}]
                </span>
                <span className="text-content text-sm font-medium">{citation.documentTitle}</span>
              </p>
              {label === null ? null : <p className="text-content-muted text-xs">{label}</p>}
              <p className="text-content border-border border-l-2 pl-3 text-sm leading-relaxed whitespace-pre-wrap">
                {citation.snippet}
              </p>
            </li>
          );
        })}
      </ol>
    </SidePanel>
  );
}
