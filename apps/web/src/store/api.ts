import { type HealthResponse } from '@docpilot/shared';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

/** Base URL of the Nest API. The web app never talks to anything else. */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Typed client for the DocPilot API.
 *
 * RTK Query owns server state that is read, cached and invalidated: documents,
 * conversations, usage and health. Chat is deliberately not here, because the
 * AI SDK's `useChat` owns the streaming message state and the two would fight
 * over the same data.
 *
 * Endpoints are declared by hand while the API surface is small. Once the
 * document and conversation endpoints exist they are generated from
 * `openapi.json`, so the client cannot drift from the server's contract.
 */
export const docpilotApi = createApi({
  reducerPath: 'docpilotApi',
  baseQuery: fetchBaseQuery({ baseUrl: API_URL }),
  tagTypes: ['Health'],
  endpoints: (build) => ({
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- RTK Query uses `void` to mean the query takes no argument
    getHealth: build.query<HealthResponse, void>({
      query: () => '/health',
      providesTags: ['Health'],
    }),
  }),
});

export const { useGetHealthQuery } = docpilotApi;
