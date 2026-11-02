import { type ReactNode } from 'react';

/** Props accepted by {@link Mark}. */
export interface MarkProps {
  /** Rendered size in pixels. Defaults to 28. */
  size?: number;
  /** Hidden from assistive technology when the name sits beside it. */
  title?: string;
}

/**
 * The DocPilot mark: a page, folded into a paper plane.
 *
 * Two ideas in one shape, which is the whole product - a document, and
 * something that carries you through it. Built from three flat planes rather
 * than an outline so it survives being rendered at sixteen pixels in a
 * browser tab, where a stroke-based mark turns to mud.
 *
 * `currentColor` on the body so it inherits from wherever it sits, with the
 * fold in the accent. One colour decision, made by the caller.
 */
export function Mark({ size = 28, title }: MarkProps): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title === undefined ? 'presentation' : 'img'}
      {...(title === undefined ? { 'aria-hidden': true } : {})}
    >
      {title === undefined ? null : <title>{title}</title>}

      {/* The page: a rounded sheet, tilted as though in flight. */}
      <path
        d="M6 4.5A2.5 2.5 0 0 1 8.5 2h10.2a2.5 2.5 0 0 1 1.77.73l5.3 5.3A2.5 2.5 0 0 1 26.5 9.8V27.5A2.5 2.5 0 0 1 24 30H8.5A2.5 2.5 0 0 1 6 27.5Z"
        fill="currentColor"
        opacity="0.18"
      />

      {/* The turned corner every page has, which is also the plane's tail. */}
      <path
        d="M18.5 2.2v5.3a2.5 2.5 0 0 0 2.5 2.5h5.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />

      {/* The plane: the page folded. Solid, so it reads at any size. */}
      <path
        d="M22.6 14.1 8.9 19.4l4.7 1.9 1.9 4.7 5.3-13.7a.9.9 0 0 0-1.2-1.2Z"
        fill="var(--mark-accent, #4f7df9)"
      />
      <path
        d="m13.6 21.3 3.1-3.1"
        stroke="var(--color-surface, #fff)"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}
