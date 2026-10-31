import { useTranslations } from 'next-intl';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { SystemStatus } from '@/components/system-status';
import { DocumentLibrary } from '@/features/documents/document-library';

/**
 * The document library, which is the product's starting point.
 *
 * Everything here works with no API key and no model: add a document, watch it
 * become searchable, remove it. The chat interface links from the top rather
 * than being the landing page, because a chat with an empty corpus can only
 * refuse to answer.
 */
export default function HomePage() {
  const t = useTranslations('home');

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">{t('heading')}</h1>
          <p className="text-content-muted leading-relaxed">{t('intro')}</p>
        </div>
        <LocaleSwitcher />
      </header>

      <DocumentLibrary />

      <section aria-labelledby="status-heading" className="flex flex-col gap-3">
        <h2
          id="status-heading"
          className="text-content-muted text-xs font-medium tracking-wide uppercase"
        >
          {t('statusHeading')}
        </h2>
        <SystemStatus />
      </section>
    </main>
  );
}
