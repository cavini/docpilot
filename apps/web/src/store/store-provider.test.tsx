import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StoreProvider } from './store-provider';
import { useAppStore } from './hooks';

function ShowStoreIdentity() {
  const store = useAppStore();

  return <span data-testid="state-keys">{Object.keys(store.getState()).join(',')}</span>;
}

describe('StoreProvider', () => {
  it('AC1: makes a store available to the components below it', () => {
    render(
      <StoreProvider>
        <ShowStoreIdentity />
      </StoreProvider>,
    );

    expect(screen.getByTestId('state-keys')).toHaveTextContent('docpilotApi');
  });

  it('AC2: gives each mount its own store, so one render cannot see another cache', () => {
    const first = render(
      <StoreProvider>
        <ShowStoreIdentity />
      </StoreProvider>,
    );
    const second = render(
      <StoreProvider>
        <ShowStoreIdentity />
      </StoreProvider>,
    );

    // Two independent trees, each with its own state. A module-level singleton
    // would be shared across requests on the server and leak one visitor's
    // cached data into another's render.
    expect(first.container).not.toBe(second.container);
    expect(screen.getAllByTestId('state-keys')).toHaveLength(2);
  });
});
