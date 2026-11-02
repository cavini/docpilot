import { type ReactNode } from 'react';

import { Mark } from './mark';

/** Props accepted by {@link Logo}. */
export interface LogoProps {
  /** Height of the mark in pixels. The wordmark scales with it. */
  size?: number;
  /**
   * Hides the wordmark, leaving the mark alone.
   *
   * For a collapsed sidebar or a favicon-sized slot, where the words would be
   * unreadable rather than merely small.
   */
  markOnly?: boolean;
}

/**
 * The DocPilot logo: the mark, and the name set beside it.
 *
 * The two halves of the name carry different weights - "Doc" in the body
 * colour, "Pilot" in the accent - so the lockup reads as one word with a
 * hinge in the middle rather than as two. It is the cheapest way to give a
 * wordmark a point of view without commissioning a typeface.
 *
 * Tracked slightly tight, because a name this short set at default tracking
 * looks like body text that wandered into the header.
 */
export function Logo({ size = 28, markOnly = false }: LogoProps): ReactNode {
  /*
    The name comes from the visible wordmark where there is one, and from the
    mark's own title where there is not.

    An earlier version put `aria-label` on this wrapper, which is prohibited:
    a plain `span` has no role, so there is nothing for the label to name.
    axe caught it on the first run after the logo went into the shell.
  */
  if (markOnly) {
    return (
      <span className="inline-flex items-center">
        <Mark size={size} title="DocPilot" />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2.5">
      <Mark size={size} />
      <span className="text-content font-semibold tracking-tight" style={{ fontSize: size * 0.62 }}>
        Doc<span className="text-accent">Pilot</span>
      </span>
    </span>
  );
}
