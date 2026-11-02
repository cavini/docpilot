'use client';

import { Logo } from '@docpilot/ui';
import { type ReactNode } from 'react';

/** Props accepted by {@link AppShell}. */
export interface AppShellProps {
  /** The rail: library, upload, and the state of the service. */
  sidebar: ReactNode;
  /** What fills the rest of the screen. */
  children: ReactNode;
  /** Sits top right of the sidebar, for the language control. */
  aside?: ReactNode;
}

/**
 * The frame: a rail of documents, and everything else.
 *
 * Replaces four stacked sections on one scrolling column. That arrangement
 * had the corpus below the conversation while the copy said "the documents
 * above", put the least important control - a language picker - at the top of
 * the page, and asked a reader to scroll past two empty states before
 * reaching anything they could do.
 *
 * The rail scrolls on its own so a long library never pushes the conversation
 * off screen, and the two columns collapse to one below the `lg` breakpoint,
 * where a rail would leave nothing for the content.
 */
export function AppShell({ sidebar, children, aside }: AppShellProps): ReactNode {
  return (
    <div className="bg-surface text-content flex min-h-dvh flex-col lg:h-dvh lg:flex-row lg:overflow-hidden">
      <aside
        /*
          Capped below `lg`. Stacked at full height the rail filled the first
          screen on a laptop at 976px, so a reader met a list of documents
          before anything they could do with them. Capped, it stays a rail:
          visible, scrollable, and out of the way.
        */
        className="border-border-subtle bg-surface-sunken flex max-h-[38dvh] shrink-0 flex-col border-b lg:max-h-none lg:h-dvh lg:w-72 lg:border-r lg:border-b-0 xl:w-80"
        aria-label="Library"
      >
        <div className="flex items-center justify-between gap-2 px-5 py-4">
          {/*
            The logo is the page's name, so it is the page's heading. Without
            this the document had no h1 at all - axe caught it the moment the
            old header was replaced by the shell.
          */}
          <h1 className="flex">
            <Logo size={26} />
          </h1>
          {aside}
        </div>

        {/* The rail's own area. What scrolls inside it is the library, so
            the status line below stays put rather than scrolling away. */}
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">{sidebar}</div>
      </aside>

      {/* `min-h-0` so the pane can shrink inside the flex column and let its
          own scroll container work, rather than growing the page. */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
