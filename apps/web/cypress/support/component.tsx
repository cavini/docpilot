import { mount } from 'cypress/react';
import { NextIntlClientProvider } from 'next-intl';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';

import messages from '../../messages/en.json';
import { makeStore } from '@/store/store';

import '@docpilot/ui/styles';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- this is how Cypress's own types are extended
  namespace Cypress {
    interface Chainable {
      /**
       * Mounts a component with the providers it has in the application: real
       * English messages, and a fresh Redux store per mount so a cached API
       * response cannot leak between tests.
       */
      mountWithProviders: (ui: ReactNode) => Cypress.Chainable;
    }
  }
}

Cypress.Commands.add('mountWithProviders', (ui: ReactNode) =>
  mount(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Provider store={makeStore()}>{ui}</Provider>
    </NextIntlClientProvider>,
  ),
);
