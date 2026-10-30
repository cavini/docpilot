import { defineRouting } from 'next-intl/routing';

/** Locales the application is translated into. */
export const LOCALES = ['en', 'pt-BR'] as const;

/** A supported locale. */
export type Locale = (typeof LOCALES)[number];

/**
 * Routing configuration shared by the middleware, the navigation helpers and
 * the server-side message loader, so there is one list of locales rather than
 * three that can drift.
 *
 * Every locale is in the path (`/en/...`, `/pt-BR/...`), including the
 * default. A visible locale segment means a link can be shared without losing
 * the language, and it keeps pages cacheable per locale rather than varying on
 * a cookie.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: 'en',
  localePrefix: 'always',
});
