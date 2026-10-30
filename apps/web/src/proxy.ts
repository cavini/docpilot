import createMiddleware from 'next-intl/middleware';

import { routing } from './i18n/routing';

/**
 * Redirects a request without a locale prefix to the best match for the
 * visitor's `Accept-Language` header, falling back to the default locale.
 *
 * Next 16 renamed this file convention from `middleware` to `proxy`; the
 * contract is otherwise the same.
 */
export default createMiddleware(routing);

export const config = {
  // Skip Next internals and anything with a file extension, so static assets
  // are not rewritten through the locale matcher.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
