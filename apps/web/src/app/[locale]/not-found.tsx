import { useTranslations } from 'next-intl';

/** Shown for an unknown path inside a known locale. */
export default function NotFound() {
  const t = useTranslations('app');

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="text-content-muted">{t('tagline')}</p>
    </main>
  );
}
