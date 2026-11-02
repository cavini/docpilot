import { type Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { type ReactNode } from 'react';

import { AccessGate } from '@/features/access/access-gate';
import { routing } from '@/i18n/routing';
import { StoreProvider } from '@/store/store-provider';

import '../globals.css';

/** Pre-renders every locale at build time instead of on first request. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/** Title and description, translated per locale. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');

  return {
    title: { default: t('name'), template: `%s · ${t('name')}` },
    description: t('tagline'),
    // An SVG favicon: one file, sharp at any size, and it follows the
    // reader's theme because it carries its own background.
    icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }] },
  };
}

/**
 * Root layout for a locale.
 *
 * Sets `lang` on `<html>` from the active locale, which assistive technology
 * uses to pick a voice and browsers use for hyphenation.
 *
 * The gate wraps everything rather than each page, so a route added later is
 * behind it without anyone remembering - the same reason the server's guard
 * is global.
 */
export default async function LocaleLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body className="bg-surface text-content min-h-dvh antialiased">
        <NextIntlClientProvider>
          <StoreProvider>
            <AccessGate>{children}</AccessGate>
          </StoreProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
