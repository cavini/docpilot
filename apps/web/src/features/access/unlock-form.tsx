'use client';

import { Button, Spinner } from '@docpilot/ui';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';

/** Props accepted by {@link UnlockForm}. */
export interface UnlockFormProps {
  /** Tries the key. Resolves to whether it was accepted. */
  onUnlock: (key: string) => Promise<boolean>;
  /** Whether the last attempt was rejected. */
  rejected: boolean;
}

/**
 * Asks for the demo key.
 *
 * The whole page until a key is accepted, rather than a banner over a working
 * interface: every control behind it would fail, and an interface that offers
 * actions it cannot perform is worse than one that explains why.
 *
 * `type="password"` so a shoulder or a screen share does not read it, with no
 * autocomplete - this is a shared demo secret, not an account credential, and
 * offering to save it in a password manager would misrepresent what it is.
 */
export function UnlockForm({ onUnlock, rejected }: UnlockFormProps): ReactNode {
  const t = useTranslations('access');
  const inputId = useId();
  const errorId = useId();
  const [key, setKey] = useState('');
  const [checking, setChecking] = useState(false);

  async function submit(): Promise<void> {
    setChecking(true);

    try {
      await onUnlock(key);
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-content text-2xl font-semibold">{t('heading')}</h1>
        <p className="text-content-muted text-sm">{t('intro')}</p>
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="flex flex-col gap-1 text-sm" htmlFor={inputId}>
          <span className="text-content-muted text-xs">{t('label')}</span>
          <input
            id={inputId}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            disabled={checking}
            onChange={(event) => {
              setKey(event.target.value);
            }}
            {...(rejected ? { 'aria-invalid': true, 'aria-describedby': errorId } : {})}
            className="border-border bg-surface text-content rounded-md border px-3 py-2 font-mono text-sm"
          />
        </label>

        {rejected ? (
          <p id={errorId} role="alert" className="text-danger text-sm">
            {t('rejected')}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={checking || key.trim() === ''}>
            {t('submit')}
          </Button>
          {checking ? <Spinner label={t('checking')} /> : null}
        </div>
      </form>

      <p className="text-content-muted text-xs">{t('note')}</p>
    </main>
  );
}
