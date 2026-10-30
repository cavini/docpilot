import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

/**
 * Locale-aware replacements for Next's navigation primitives.
 *
 * Using these instead of `next/link` and `next/navigation` keeps the active
 * locale in every internal link automatically, so a missing prefix cannot slip
 * into a href by hand.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
