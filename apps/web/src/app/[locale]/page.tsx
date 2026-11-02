import { LocaleSwitcher } from '@/components/locale-switcher';
import { AppShell } from '@/components/shell/app-shell';
import { WorkspaceTabs } from '@/components/shell/workspace-tabs';
import { SystemStatus } from '@/components/system-status';
import { ChatView } from '@/features/chat/chat-view';
import { DocumentLibrary } from '@/features/documents/document-library';
import { ExtractionView } from '@/features/extraction/extraction-view';

/**
 * The product: a corpus in the rail, and a conversation about it.
 *
 * The corpus sits beside the conversation rather than under it, because a
 * reader judging an answer wants to see what it could possibly have come
 * from without leaving the answer. Asking and extracting share the main
 * column as two panes: both ask a question of the same documents, and nobody
 * wants both at once.
 */
export default function HomePage() {
  return (
    <AppShell
      aside={<LocaleSwitcher />}
      sidebar={
        /*
          The library takes the space that is left and scrolls; the status
          keeps its own. `h-full` with the status last meant that expanding
          it had nowhere to grow into, so the rows opened past the bottom of
          the rail and were simply cut off.
        */
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <DocumentLibrary />
          </div>
          <div className="shrink-0 pt-1">
            <SystemStatus />
          </div>
        </div>
      }
    >
      <WorkspaceTabs
        tabs={[
          { id: 'ask', labelKey: 'ask', content: <ChatView /> },
          { id: 'extract', labelKey: 'extract', content: <ExtractionView /> },
        ]}
      />
    </AppShell>
  );
}
