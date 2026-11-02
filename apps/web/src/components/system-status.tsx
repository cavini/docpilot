'use client';

import { type HealthStatus } from '@docpilot/shared';
import { useTranslations } from 'next-intl';

import { useGetHealthQuery } from '@/store/api';

/** Dot colour per status, so the state is not carried by text alone. */
const DOT_CLASS: Record<HealthStatus, string> = {
  ok: 'bg-ok',
  degraded: 'bg-warn',
  down: 'bg-danger',
};

function StatusRow({ label, status }: { label: string; status: HealthStatus }) {
  const t = useTranslations('status');

  return (
    <li className="border-border flex items-center justify-between border-b py-2 last:border-b-0">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className={`size-2 rounded-full ${DOT_CLASS[status]}`} />
        <span className="text-content-muted text-sm">{t(status)}</span>
      </span>
    </li>
  );
}

/**
 * Shows the API's health and that of each dependency.
 *
 * A client component because it fetches on the client through RTK Query: the
 * status is live rather than fixed at build time, and the same cache is shared
 * with anything else that reads health.
 *
 * The status is announced through text as well as colour, and the live region
 * tells a screen reader when it changes, so the state does not depend on being
 * able to see a coloured dot.
 */
export function SystemStatus() {
  const t = useTranslations('status');
  const { data, isLoading, isError } = useGetHealthQuery();

  if (isLoading) {
    return (
      <p aria-live="polite" className="text-content-muted text-sm">
        {t('loading')}
      </p>
    );
  }

  if (isError || !data) {
    return (
      <p aria-live="polite" role="status" className="text-danger text-sm">
        {t('unreachable')}
      </p>
    );
  }

  /*
    A summary line that opens, rather than four rows always on screen.

    In a sidebar the expanded form took as much room as five documents to
    say the same thing four times, and a reader only ever wants the detail
    when the summary is not "operational". `<details>` gives that for free,
    including keyboard operation, and the summary stays in the live region so
    a change is still announced.
  */
  const healthy = data.status === 'ok';

  return (
    <details
      className="border-border-subtle bg-surface-muted/60 group rounded-lg border px-3 py-2"
      open={!healthy}
    >
      <summary
        aria-live="polite"
        className="text-content-muted marker:content-none flex cursor-pointer list-none items-center gap-2 text-xs"
      >
        <span
          aria-hidden
          className={`size-1.5 shrink-0 rounded-full ${healthy ? 'bg-ok' : 'bg-danger'}`}
        />
        <span className="flex-1">{healthy ? t('allOperational') : t('someDegraded')}</span>
        <span aria-hidden className="transition-transform group-open:rotate-180">
          ⌃
        </span>
      </summary>

      <ul className="mt-1">
        <StatusRow label={t('database')} status={data.dependencies.database.status} />
        <StatusRow label={t('redis')} status={data.dependencies.redis.status} />
        <StatusRow label={t('storage')} status={data.dependencies.storage.status} />
      </ul>
    </details>
  );
}
