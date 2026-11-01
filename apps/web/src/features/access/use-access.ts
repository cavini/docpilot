'use client';

import { useCallback, useEffect, useState } from 'react';

import { DEMO_KEY_HEADER, DEMO_KEY_REQUIRED, readDemoKey, writeDemoKey } from './demo-key';

/** Base URL of the Nest API. */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Where the reader stands with this deployment. */
export type AccessStatus =
  /** Deciding whether a stored key still works. No request has failed yet. */
  | 'checking'
  /** A key is needed and there is not a working one. */
  | 'locked'
  /** Either no key is needed, or the stored one was accepted. */
  | 'unlocked';

/** What the server said about the demo once a key was accepted. */
export interface AccessState {
  status: AccessStatus;
  /** True when the day's spend ceiling has been reached. */
  budgetSpent: boolean;
  /** When the ceiling lifts, as an ISO instant. */
  resetsAt: string | null;
  /** Set when the last attempt was rejected, cleared when one succeeds. */
  rejected: boolean;
  /** Tries a key and keeps it if the server accepts it. */
  unlock: (key: string) => Promise<boolean>;
  /** Forgets the stored key and shows the form again. */
  lock: () => void;
}

/** What `GET /access` answers. */
interface AccessResponse {
  ok: boolean;
  keyRequired: boolean;
  budget: { spent: boolean; resetsAt: string | null };
}

/**
 * Decides whether the reader may use the app, and says what they will get.
 *
 * **No request is made without a key when one is required.** The decision
 * comes from the build, not from the server: a client that probes an endpoint
 * to find out whether it is allowed to call endpoints has already called one,
 * and on a gated deployment that is a request a crawler could have made too.
 *
 * A stored key is still checked against `GET /access` before the app is shown,
 * because a key that was rotated yesterday would otherwise fail on whatever
 * the reader tried first - which is a worse place to learn it.
 *
 * @returns Where the reader stands, and the two ways to change it.
 */
export function useAccess(): AccessState {
  const [status, setStatus] = useState<AccessStatus>(() =>
    DEMO_KEY_REQUIRED ? 'checking' : 'unlocked',
  );
  const [budgetSpent, setBudgetSpent] = useState(false);
  const [resetsAt, setResetsAt] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);

  /** Asks the server about a key. Returns whether it was accepted. */
  const check = useCallback(async (key: string | null, signal?: AbortSignal): Promise<boolean> => {
    const response = await fetch(`${API_URL}/access`, {
      headers: key === null ? {} : { [DEMO_KEY_HEADER]: key },
      ...(signal === undefined ? {} : { signal }),
    });

    if (!response.ok) {
      return false;
    }

    const body = (await response.json()) as AccessResponse;

    setBudgetSpent(body.budget.spent);
    setResetsAt(body.budget.resetsAt);

    return true;
  }, []);

  useEffect(() => {
    if (!DEMO_KEY_REQUIRED) {
      return;
    }

    const controller = new AbortController();

    // Storage is read inside the task rather than in the effect body. It
    // cannot be read during render either - this component is server
    // rendered, where there is no storage, and deciding differently on the
    // two sides is a hydration mismatch. So the first paint is always the
    // spinner, and the answer arrives a tick later.
    void (async () => {
      const stored = readDemoKey();

      if (stored === null) {
        // The whole point: nothing is sent. The form is shown instead.
        setStatus('locked');

        return;
      }

      try {
        const accepted = await check(stored, controller.signal);

        if (!accepted) {
          // Rotated, mistyped or expired. Discarded rather than kept around
          // to fail on the reader's first real action.
          writeDemoKey(null);
        }

        setStatus(accepted ? 'unlocked' : 'locked');
      } catch {
        // The API is unreachable. Showing the form would tell the reader to
        // fix a key that is probably fine, so the app is shown and whatever
        // they do next reports the real problem.
        if (!controller.signal.aborted) {
          setStatus('unlocked');
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [check]);

  const unlock = useCallback(
    async (key: string): Promise<boolean> => {
      const trimmed = key.trim();

      if (trimmed === '') {
        setRejected(true);

        return false;
      }

      const accepted = await check(trimmed).catch(() => false);

      setRejected(!accepted);

      if (accepted) {
        // Stored only once the server has accepted it, so a wrong key is
        // never kept and never sent again.
        writeDemoKey(trimmed);
        setStatus('unlocked');
      }

      return accepted;
    },
    [check],
  );

  const lock = useCallback((): void => {
    writeDemoKey(null);
    setStatus('locked');
    setRejected(false);
  }, []);

  return { status, budgetSpent, resetsAt, rejected, unlock, lock };
}
