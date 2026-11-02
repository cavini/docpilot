'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALES, type Locale } from '@/i18n/routing';

/**
 * Switches the interface language.
 *
 * A `<select>` rather than a custom dropdown: it is keyboard accessible,
 * announced correctly by screen readers and uses the platform's own picker on
 * mobile, none of which a div-based menu gets for free.
 *
 * The change is wrapped in a transition so the current page stays interactive
 * while the new locale's page streams in.
 */
export function LocaleSwitcher() {
  const t = useTranslations('locale');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    /*
      The visible label is gone, not the label itself. Stacked above the
      control it made the least important thing on the page into the tallest
      element in the header, next to the logo. The accessible name is carried
      by `sr-only` text, so nothing is lost to a screen reader.
    */
    <label className="flex items-center text-sm">
      <span className="sr-only">{t('label')}</span>
      <select
        className="border-border bg-surface-raised text-content-muted hover:text-content cursor-pointer rounded-md border px-2 py-1 text-xs transition-colors"
        value={locale}
        disabled={isPending}
        onChange={(event) => {
          const next = event.target.value as Locale;
          startTransition(() => {
            router.replace(pathname, { locale: next });
          });
        }}
      >
        {LOCALES.map((option) => (
          <option key={option} value={option}>
            {t(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
