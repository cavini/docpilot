import { useTranslations } from 'next-intl';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { SystemStatus } from '@/components/system-status';
import { ChatView } from '@/features/chat/chat-view';
import { DocumentLibrary } from '@/features/documents/document-library';

/**
 * The product: a corpus, and a conversation about it.
 *
 * One page rather than two, because the two halves are read together — a
 * reader adding a document wants to ask about it straight away, and a reader
 * getting an unhelpful answer wants to see what is actually in the corpus.
 */
export default function HomePage() {
  const t = useTranslations('home');

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">{t('heading')}</h1>
          <p className="text-content-muted leading-relaxed">{t('intro')}</p>
        </div>
        <LocaleSwitcher />
      </header>

      <ChatView />

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
