'use client';

import { Logo } from '@docpilot/ui';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';

/** Props accepted by {@link AppShell}. */
export interface AppShellProps {
  /** The rail: library, upload, and the state of the service. */
  sidebar: ReactNode;
  /** What fills the rest of the screen. */
  children: ReactNode;
  /** Shown on the button that opens the library on a narrow screen. */
  libraryCount?: ReactNode;
}

/**
 * The frame: a rail of documents, and everything else.
 *
 * On a wide screen the rail is always there, because there is room for it and
 * a reader judging an answer wants to see what it could have come from.
 *
 * On a narrow one it is a sheet that slides over. Stacked above the
 * workspace it took nearly half a phone screen - a logo, a language picker, a
 * full-size drop target and two and a half documents - before a reader
 * reached anything they could do, and pushed the composer off the bottom
 * entirely. The documents are not what someone opens this to look at.
 */
export function AppShell({ sidebar, children, libraryCount }: AppShellProps): ReactNode {
  const t = useTranslations('shell');
  const [libraryOpen, setLibraryOpen] = useState(false);

  // A sheet that survives a rotation into the desktop layout would leave an
  // overlay covering a rail that is already on screen.
  useEffect(() => {
    if (!libraryOpen) {
      return;
    }

    const wide = window.matchMedia('(min-width: 1024px)');
    const close = (): void => {
      if (wide.matches) {
        setLibraryOpen(false);
      }
    };

    close();
    wide.addEventListener('change', close);

    return () => {
      wide.removeEventListener('change', close);
    };
  }, [libraryOpen]);

  // Escape closes it, which every overlay owes a keyboard.
  useEffect(() => {
    if (!libraryOpen) {
      return;
    }

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setLibraryOpen(false);
      }
    };

    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [libraryOpen]);

  return (
    <div className="bg-surface text-content flex h-dvh flex-col overflow-hidden lg:flex-row">
      {/* Narrow only: the one bar that is always there. */}
      <header className="border-border-subtle flex shrink-0 items-center gap-2 border-b px-4 py-2.5 lg:hidden">
        <h1 className="flex flex-1">
          <Logo size={24} />
        </h1>

        <button
          type="button"
          onClick={() => {
            setLibraryOpen(true);
          }}
          aria-expanded={libraryOpen}
          className="border-border bg-surface-raised text-content-muted hover:text-content flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors"
        >
          {t('documents')}
          {libraryCount === undefined ? null : (
            <span className="text-content tabular-nums">{libraryCount}</span>
          )}
        </button>
      </header>

      {/* Dims and closes. Only ever present on a narrow screen. */}
      {libraryOpen ? (
        <button
          type="button"
          aria-label={t('closeLibrary')}
          onClick={() => {
            setLibraryOpen(false);
          }}
          className="bg-surface/70 fixed inset-0 z-40 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      <aside
        aria-label={t('library')}
        className={[
          'bg-surface-sunken border-border-subtle flex flex-col',
          // Narrow: a sheet off the left edge, present in the tree either way
          // so the library keeps its state and its socket subscription.
          'fixed inset-y-0 left-0 z-50 w-[85vw] max-w-sm border-r transition-transform duration-200 ease-out',
          libraryOpen ? 'translate-x-0' : '-translate-x-full',
          // Wide: part of the layout, never translated.
          'lg:static lg:z-auto lg:w-72 lg:max-w-none lg:translate-x-0 xl:w-80',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-4 lg:py-4">
          <h1 className="hidden lg:flex">
            <Logo size={26} />
          </h1>
          <span className="text-content font-semibold lg:hidden">{t('documents')}</span>

          <button
            type="button"
            onClick={() => {
              setLibraryOpen(false);
            }}
            className="text-content-muted hover:text-content px-1 text-lg leading-none lg:hidden"
            aria-label={t('closeLibrary')}
          >
            ×
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">{sidebar}</div>
      </aside>

      {/* `min-h-0` so the pane can shrink inside the flex column and let its
          own scroll container work, rather than growing the page. */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
