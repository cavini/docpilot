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
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-content-muted">{t('label')}</span>
      <select
        className="border-border bg-surface rounded-md border px-2 py-1"
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
