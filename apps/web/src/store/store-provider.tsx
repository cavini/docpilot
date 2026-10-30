'use client';

import { type ReactNode, useState } from 'react';
import { Provider } from 'react-redux';

import { makeStore } from './store';

/**
 * Makes the Redux store available to client components.
 *
 * The store is created lazily on first render and kept in state, so a
 * re-render never replaces it and throws away the cache. Creating it here
 * rather than at module scope is what keeps one visitor's cached data out of
 * another visitor's server render.
 *
 * `useState` with an initialiser rather than a ref: reading `ref.current`
 * during render is unsafe, because React may discard and replay a render, and
 * the lazy initialiser gives the same create-once behaviour without that risk.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(makeStore);

  return <Provider store={store}>{children}</Provider>;
}
