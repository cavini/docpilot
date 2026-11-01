import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AccessGateModule from './access-gate';
import { renderWithProviders } from '@/test/render';

const KEY = 'c2f1f0b1e0a94a1d8f3c7b6e5d4a3b2c';

/** A successful `GET /access` body. */
function accepted(
  budget: { spent: boolean; resetsAt: string | null } = {
    spent: false,
    resetsAt: null,
  },
): Response {
  return new Response(JSON.stringify({ ok: true, keyRequired: true, budget }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Loads the gate with the deployment gated or open.
 *
 * The module reads `NEXT_PUBLIC_DEMO_KEY_REQUIRED` at import time, which is
 * the whole point - so each test imports it fresh with the variable set.
 */
async function loadGate(required: boolean): Promise<typeof AccessGateModule> {
  vi.stubEnv('NEXT_PUBLIC_DEMO_KEY_REQUIRED', required ? 'true' : 'false');
  vi.resetModules();

  return import('./access-gate');
}

describe('AccessGate', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('AC5: makes no request at all when a key is required and none is stored', async () => {
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    const { AccessGate } = await loadGate(true);

    renderWithProviders(
      <AccessGate>
        <p>the application</p>
      </AccessGate>,
    );

    expect(await screen.findByRole('heading', { name: 'This demo needs a key' })).toBeVisible();

    // The assertion that matters. Checking only that the form is visible
    // would pass while the app quietly called the API behind it, which is
    // exactly the failure this is meant to prevent.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('AC5: does not render the application behind the form', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const { AccessGate } = await loadGate(true);

    renderWithProviders(
      <AccessGate>
        <p>the application</p>
      </AccessGate>,
    );

    await screen.findByRole('heading', { name: 'This demo needs a key' });
    expect(screen.queryByText('the application')).not.toBeInTheDocument();
  });

  it('AC3: renders the application untouched when no key is required', async () => {
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    const { AccessGate } = await loadGate(false);

    renderWithProviders(
      <AccessGate>
        <p>the application</p>
      </AccessGate>,
    );

    expect(await screen.findByText('the application')).toBeVisible();

    // Local development is unchanged: no probe, no form, no spinner.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks a stored key before showing the application', async () => {
    window.sessionStorage.setItem('docpilot.demoKey', KEY);

    const fetchMock = vi.fn(() => Promise.resolve(accepted()));

    vi.stubGlobal('fetch', fetchMock);

    const { AccessGate } = await loadGate(true);

    renderWithProviders(
      <AccessGate>
        <p>the application</p>
      </AccessGate>,
    );

    expect(await screen.findByText('the application')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/access'),
      expect.objectContaining({ headers: { 'x-demo-key': KEY } }),
    );
  });

  it('AC6: discards a stored key the server rejects and asks again', async () => {
    window.sessionStorage.setItem('docpilot.demoKey', 'rotated-away');

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 401 }))),
    );

    const { AccessGate } = await loadGate(true);

    renderWithProviders(
      <AccessGate>
        <p>the application</p>
      </AccessGate>,
    );

    expect(await screen.findByRole('heading', { name: 'This demo needs a key' })).toBeVisible();

    // Kept, it would fail on whatever the reader tried first, which is a
    // worse place to learn the key is stale.
    expect(window.sessionStorage.getItem('docpilot.demoKey')).toBeNull();
  });

  it('stores a key only once the server has accepted it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(accepted());

    vi.stubGlobal('fetch', fetchMock);

    const { AccessGate } = await loadGate(true);

    renderWithProviders(
      <AccessGate>
        <p>the application</p>
      </AccessGate>,
    );

    const input = await screen.findByLabelText('Demo key');

    await userEvent.type(input, 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That key was not accepted');
    expect(window.sessionStorage.getItem('docpilot.demoKey')).toBeNull();

    await userEvent.clear(input);
    await userEvent.type(input, KEY);
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(await screen.findByText('the application')).toBeVisible();
    expect(window.sessionStorage.getItem('docpilot.demoKey')).toBe(KEY);
  });

  it('keeps the key out of the markup, so a screen share does not read it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(accepted())),
    );

    const { AccessGate } = await loadGate(true);

    renderWithProviders(
      <AccessGate>
        <p>the application</p>
      </AccessGate>,
    );

    const input = await screen.findByLabelText('Demo key');

    expect(input).toHaveAttribute('type', 'password');

    // Not an account credential: offering to save it would misrepresent what
    // a shared demo secret is.
    expect(input).toHaveAttribute('autocomplete', 'off');
  });

  it('AC13: says when the budget is spent, above the application', async () => {
    window.sessionStorage.setItem('docpilot.demoKey', KEY);

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(accepted({ spent: true, resetsAt: '2026-11-02T00:00:00.000Z' }))),
    );

    const { AccessGate } = await loadGate(true);

    renderWithProviders(
      <AccessGate>
        <p>the application</p>
      </AccessGate>,
    );

    // Waited for first: the checking spinner also carries `role="status"`,
    // so querying before the check resolves finds the wrong element.
    expect(await screen.findByText('the application')).toBeVisible();

    const notice = screen.getByRole('status');

    expect(notice).toHaveTextContent(/budget is spent/i);
    expect(notice).toHaveTextContent(/Retrieval and citations are real/i);
  });

  it('says nothing about the budget when there is some left', async () => {
    window.sessionStorage.setItem('docpilot.demoKey', KEY);

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(accepted())),
    );

    const { AccessGate } = await loadGate(true);

    renderWithProviders(
      <AccessGate>
        <p>the application</p>
      </AccessGate>,
    );

    await screen.findByText('the application');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the application when the API cannot be reached at all', async () => {
    window.sessionStorage.setItem('docpilot.demoKey', KEY);

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('Failed to fetch'))),
    );

    const { AccessGate } = await loadGate(true);

    renderWithProviders(
      <AccessGate>
        <p>the application</p>
      </AccessGate>,
    );

    // Showing the unlock form here would tell the reader to fix a key that is
    // probably fine. Whatever they do next reports the real problem.
    await waitFor(() => {
      expect(screen.getByText('the application')).toBeVisible();
    });
    expect(window.sessionStorage.getItem('docpilot.demoKey')).toBe(KEY);
  });
});
