import { useTranslations } from 'next-intl';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { SystemStatus } from '@/components/system-status';

/**
 * Landing page.
 *
 * A placeholder while the chat interface is built, but a real one: it reads
 * the API's health through the same typed client the rest of the application
 * will use, so the path from browser to Nest to Postgres is exercised from the
 * first milestone.
 */
export default function HomePage() {
  const t = useTranslations('home');

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex items-start justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{t('heading')}</h1>
        <LocaleSwitcher />
      </header>

      <p className="text-content-muted text-lg leading-relaxed">{t('intro')}</p>

      <section aria-labelledby="status-heading" className="flex flex-col gap-3">
        <h2 id="status-heading" className="text-sm font-medium tracking-wide uppercase">
          {t('statusHeading')}
        </h2>
        <SystemStatus />
      </section>
    </main>
  );
}
