import { configureStore } from '@reduxjs/toolkit';

import { docpilotApi } from './api';

/**
 * Builds the Redux store.
 *
 * A factory rather than a module-level singleton: a singleton is shared across
 * requests on the server, which would leak one visitor's cached data into
 * another's render. Each render and each test gets its own store.
 */
export function makeStore() {
  return configureStore({
    reducer: {
      [docpilotApi.reducerPath]: docpilotApi.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(docpilotApi.middleware),
  });
}

/** The store type, for typed hooks and tests. */
export type AppStore = ReturnType<typeof makeStore>;

/** Shape of the whole Redux state. */
export type RootState = ReturnType<AppStore['getState']>;

/** Dispatch type that knows about the API middleware's thunks. */
export type AppDispatch = AppStore['dispatch'];
