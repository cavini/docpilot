'use client';

import { type ReactNode } from 'react';

import { useListDocumentsQuery } from '@/store/api';

/**
 * How many documents there are, for the button that opens the library.
 *
 * Its own component so the narrow-screen header can show the number without
 * the whole shell subscribing to the document list - the shell is rendered on
 * every screen and has no other reason to know.
 *
 * Reads the same cached query the library does, so it costs no extra request.
 */
export function LibraryCount(): ReactNode {
  const { data } = useListDocumentsQuery();
  const total = data?.items.length ?? 0;

  return total === 0 ? null : <>{total}</>;
}
