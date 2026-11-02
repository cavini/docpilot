'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';

/** One pane of the workspace. */
export interface WorkspaceTab {
  id: string;
  /** Key under `workspace.tab` in the message catalogue. */
  labelKey: string;
  content: ReactNode;
}

/** Props accepted by {@link WorkspaceTabs}. */
export interface WorkspaceTabsProps {
  tabs: WorkspaceTab[];
}

/**
 * Asking and extracting, as two panes rather than two stacked sections.
 *
 * Both answer a question about the same corpus, and only one is wanted at a
 * time. Stacking them meant scrolling past a whole conversation to reach a
 * table, and made a page with no obvious beginning.
 *
 * Every pane stays mounted and is hidden with `hidden` rather than unmounted,
 * so switching away from a running extraction and back does not lose the rows
 * that arrived while it was off screen.
 */
export function WorkspaceTabs({ tabs }: WorkspaceTabsProps): ReactNode {
  const t = useTranslations('workspace');
  const groupId = useId();
  const [active, setActive] = useState(tabs[0]?.id ?? '');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="tablist"
        aria-label={t('label')}
        className="border-border-subtle flex shrink-0 items-center gap-1 border-b px-4"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${groupId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${groupId}-panel-${tab.id}`}
              onClick={() => {
                setActive(tab.id);
              }}
              className={[
                'relative px-3 py-3 text-sm font-medium transition-colors',
                selected ? 'text-content' : 'text-content-muted hover:text-content',
              ].join(' ')}
            >
              {t(`tab.${tab.labelKey}`)}
              {/* Drawn rather than a bottom border, so the indicator can sit
                  on the divider instead of nudging the label up by a pixel. */}
              <span
                aria-hidden
                className={[
                  'bg-accent absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-opacity',
                  selected ? 'opacity-100' : 'opacity-0',
                ].join(' ')}
              />
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${groupId}-panel-${tab.id}`}
          aria-labelledby={`${groupId}-tab-${tab.id}`}
          hidden={tab.id !== active}
          className={tab.id === active ? 'flex min-h-0 flex-1 flex-col' : ''}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
