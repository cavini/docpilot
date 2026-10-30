import { type Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { type ReactNode } from 'react';

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

  return { title: t('name'), description: t('tagline') };
}

/**
 * Root layout for a locale.
 *
 * Sets `lang` on `<html>` from the active locale, which assistive technology
 * uses to pick a voice and browsers use for hyphenation.
 */
export default async function LocaleLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider>
          <StoreProvider>{children}</StoreProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
