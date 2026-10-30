import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { localeParam } from './root-params';
import { routing } from './routing';

/** Shape of a dynamically imported message catalogue. */
interface MessageModule {
  default: Record<string, unknown>;
}

/**
 * Loads the message catalogue for the locale being rendered.
 *
 * The locale comes from the `[locale]` route segment through
 * `next/root-params`, which replaced the older `setRequestLocale` call that
 * every layout and page previously had to make. Reading it here means a page
 * can still be rendered statically without opting into that boilerplate.
 *
 * Catalogues are imported dynamically so each request ships only the locale it
 * needs rather than every translation in the application. An unrecognised
 * segment is a 404 rather than a silent fallback, because the middleware only
 * ever routes to a known locale, so anything else is a bad URL.
 */
export default getRequestConfig(async () => {
  const requested = await localeParam();

  if (!hasLocale(routing.locales, requested)) {
    notFound();
  }

  // A dynamic import with a template literal is untyped, so the shape is
  // asserted here rather than left as `any` for the caller.
  const catalogue = (await import(`../../messages/${requested}.json`)) as MessageModule;

  return { locale: requested, messages: catalogue.default };
});
