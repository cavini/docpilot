import { render as rtlRender, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { type ReactElement } from 'react';
import { Provider } from 'react-redux';

import messages from '../../messages/en.json';
import { makeStore } from '@/store/store';

/**
 * Renders a component with the providers it needs in the application.
 *
 * Tests get a fresh store each time, so a cached API response cannot leak from
 * one test into the next. Real English messages are used rather than stubs, so
 * a test fails when a translation key is missing instead of silently rendering
 * the key.
 *
 * @param ui Element to render.
 * @returns Testing Library's result, plus the store the render used.
 *
 * @example
 * ```tsx
 * renderWithProviders(<SystemStatus />);
 * expect(await screen.findByText('Operational')).toBeInTheDocument();
 * ```
 */
export function renderWithProviders(ui: ReactElement): RenderResult & {
  store: ReturnType<typeof makeStore>;
} {
  const store = makeStore();

  const result = rtlRender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Provider store={store}>{ui}</Provider>
    </NextIntlClientProvider>,
  );

  return { ...result, store };
}
