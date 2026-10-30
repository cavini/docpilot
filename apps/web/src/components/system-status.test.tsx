import { type HealthResponse } from '@docpilot/shared';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SystemStatus } from './system-status';
import { renderWithProviders } from '@/test/render';

const healthy: HealthResponse = {
  status: 'ok',
  version: '0.0.0',
  uptimeSeconds: 12,
  checkedAt: '2026-10-30T12:00:00.000Z',
  dependencies: {
    database: { status: 'ok', latencyMs: 3 },
    redis: { status: 'ok', latencyMs: 1 },
    storage: { status: 'ok', latencyMs: 8 },
  },
};

/** Stubs the API response the component fetches through RTK Query. */
function mockHealth(response: HealthResponse | { reject: true }, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      'reject' in response
        ? Promise.reject(new Error('network down'))
        : Promise.resolve(
            new Response(JSON.stringify(response), {
              status,
              headers: { 'content-type': 'application/json' },
            }),
          ),
    ),
  );
}

describe('SystemStatus', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AC1: shows a loading message before the API answers', () => {
    mockHealth(healthy);

    renderWithProviders(<SystemStatus />);

    expect(screen.getByText('Checking the API…')).toBeInTheDocument();
  });

  it('AC2: lists every dependency once the API answers', async () => {
    mockHealth(healthy);

    renderWithProviders(<SystemStatus />);

    expect(await screen.findByText('Database')).toBeInTheDocument();
    expect(screen.getByText('Redis')).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(screen.getByText('Overall')).toBeInTheDocument();
  });

  it('AC3: states each status in words, not only as a colour', async () => {
    mockHealth(healthy);

    renderWithProviders(<SystemStatus />);

    expect(await screen.findAllByText('Operational')).toHaveLength(4);
  });

  it('AC4: reports a failing dependency with its own status', async () => {
    mockHealth({
      ...healthy,
      status: 'down',
      dependencies: { ...healthy.dependencies, redis: { status: 'down', error: 'refused' } },
    });

    renderWithProviders(<SystemStatus />);

    await waitFor(() => {
      expect(screen.getAllByText('Unavailable')).toHaveLength(2);
    });
    expect(screen.getAllByText('Operational')).toHaveLength(2);
  });

  it('AC5: shows which dependency failed even when the API answers 503', async () => {
    // The API returns 503 together with the full body. Rendering "unreachable"
    // here would hide the one piece of information the reader needs.
    mockHealth(
      {
        ...healthy,
        status: 'down',
        dependencies: { ...healthy.dependencies, redis: { status: 'down', error: 'refused' } },
      },
      503,
    );

    renderWithProviders(<SystemStatus />);

    await waitFor(() => {
      expect(screen.getAllByText('Unavailable')).toHaveLength(2);
    });
    expect(screen.queryByText(/not reachable/)).not.toBeInTheDocument();
  });

  it('AC6: shows an actionable message when the API cannot be reached', async () => {
    mockHealth({ reject: true });

    renderWithProviders(<SystemStatus />);

    expect(
      await screen.findByText('The API is not reachable. Start it with pnpm dev.'),
    ).toBeInTheDocument();
  });

  it('AC7: announces changes through a live region', async () => {
    mockHealth(healthy);

    const { container } = renderWithProviders(<SystemStatus />);

    await screen.findByText('Database');
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('AC8: hides the decorative status dot from assistive technology', async () => {
    mockHealth(healthy);

    const { container } = renderWithProviders(<SystemStatus />);

    await screen.findByText('Database');
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4);
  });
});
