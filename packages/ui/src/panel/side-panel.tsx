import { type ReactNode, useCallback, useEffect, useRef } from 'react';

/** Props accepted by {@link SidePanel}. */
export interface SidePanelProps {
  /** Whether the panel is showing. */
  open: boolean;
  /** Called when the reader dismisses it. */
  onClose: () => void;
  /** Heading, which is also the panel's accessible name. */
  title: ReactNode;
  /** Accessible label for the close button. */
  closeLabel: string;
  /** Panel contents. */
  children: ReactNode;
}

/**
 * A panel that slides in from the right.
 *
 * Three things here are about keyboard use rather than looks, and each is a
 * common way a panel like this becomes unusable:
 *
 * - **Escape closes it.** Bound on the panel itself rather than the document,
 *   so it does not fight whatever else is listening on the page.
 * - **Focus moves in when it opens and back out when it closes.** The element
 *   that had focus is remembered and restored, so a reader who opened the
 *   panel from a citation chip lands back on that chip rather than at the top
 *   of the document.
 * - **It is not rendered at all when closed.** A visually hidden panel that
 *   stays mounted keeps its contents in the tab order, which is why so many
 *   dialogs trap a keyboard user in invisible controls.
 *
 * `role="dialog"` with `aria-modal={false}`: the page behind stays usable on
 * purpose, because the reader is comparing an answer against its source and
 * needs both.
 *
 * @example
 * ```tsx
 * <SidePanel open={n !== null} onClose={close} title="Sources" closeLabel="Close">
 *   …
 * </SidePanel>
 * ```
 */
export function SidePanel({
  open,
  onClose,
  title,
  closeLabel,
  children,
}: SidePanelProps): ReactNode {
  const panel = useRef<HTMLDivElement | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    restoreTo.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();

    return () => {
      restoreTo.current?.focus();
    };
  }, [open]);

  const onKeyDown = useCallback(
    (event: { key: string; stopPropagation: () => void }): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  if (!open) {
    return null;
  }

  return (
    // `jsx-a11y` treats `role="dialog"` as non-interactive and so objects to a
    // key handler on it. A dialog that closes on Escape is the ARIA pattern
    // for a dialog, and the alternative the rule would accept — listening on
    // `document` — is worse: it fires wherever focus is, so the panel would
    // swallow Escape from the rest of the page. Scoped to this element so the
    // rule stays on everywhere else.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={panel}
      role="dialog"
      aria-modal={false}
      aria-label={typeof title === 'string' ? title : undefined}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="flex h-full w-full flex-col overflow-hidden border-l border-border bg-surface md:w-96"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-content">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="flex size-7 items-center justify-center rounded text-content-muted hover:bg-surface-muted hover:text-content"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
}
