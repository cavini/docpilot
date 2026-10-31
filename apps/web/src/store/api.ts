import { type HealthResponse } from '@docpilot/shared';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

import { type DocumentPage, type DocumentSummary } from '../features/documents/document.types';

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
  tagTypes: ['Health', 'Document'],
  endpoints: (build) => ({
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- RTK Query uses `void` to mean the query takes no argument
    getHealth: build.query<HealthResponse, void>({
      query: () => ({
        url: '/health',
        // The API answers 503 when a dependency is down, and that response
        // still carries the full body saying which one. Treating it as an
        // error would throw away exactly the information the page exists to
        // show, leaving the reader with "unreachable" when the API is in fact
        // answering. A genuine transport failure still fails.
        validateStatus: (response) => response.status === 200 || response.status === 503,
      }),
      providesTags: ['Health'],
    }),

    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- RTK Query uses `void` to mean the query takes no argument
    listDocuments: build.query<DocumentPage, void>({
      query: () => ({ url: '/documents', params: { limit: 50 } }),
      // One tag per document plus a list tag. An upload invalidates the list;
      // a socket event patches one row without refetching the whole page.
      providesTags: (page) => [
        { type: 'Document' as const, id: 'LIST' },
        ...(page?.items ?? []).map((document) => ({
          type: 'Document' as const,
          id: document.id,
        })),
      ],
    }),

    uploadDocument: build.mutation<{ document: DocumentSummary; duplicate: boolean }, File>({
      query: (file) => {
        const body = new FormData();
        body.append('file', file);

        return {
          url: '/documents',
          method: 'POST',
          body,
          // 200 means these bytes were already held and the existing document
          // came back. That is a success the reader should be told about, not
          // an error — so both statuses pass, and the caller distinguishes
          // them rather than the transport layer.
          validateStatus: (response) => response.status === 201 || response.status === 200,
          responseHandler: async (response) => ({
            document: (await response.json()) as DocumentSummary,
            duplicate: response.status === 200,
          }),
        };
      },
      invalidatesTags: [{ type: 'Document', id: 'LIST' }],
    }),

    retryDocument: build.mutation<DocumentSummary, string>({
      query: (id) => ({ url: `/documents/${id}/retry`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Document', id },
        { type: 'Document', id: 'LIST' },
      ],
    }),

    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- a 204 has no body, and `void` is how RTK Query spells that
    deleteDocument: build.mutation<void, string>({
      query: (id) => ({ url: `/documents/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Document', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetHealthQuery,
  useListDocumentsQuery,
  useUploadDocumentMutation,
  useRetryDocumentMutation,
  useDeleteDocumentMutation,
} = docpilotApi;
