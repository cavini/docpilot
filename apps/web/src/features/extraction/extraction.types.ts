import { type SchemaField } from '@docpilot/shared';

/** One schema the server can extract, as `GET /extract/schemas` returns it. */
export interface SchemaSummary {
  name: string;
  title: string;
  description: string;
  fields: SchemaField[];
}

/** A passage an extraction drew on. */
export interface ExtractionCitation {
  n: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  headingPath: string | null;
}

/** One event from `POST /extract/stream`. */
export type ExtractionEvent =
  | {
      type: 'schema';
      schema: string;
      citations: ExtractionCitation[];
      /** True when the rows did not come from a real model. */
      degraded?: boolean;
      /** When the spend ceiling lifts, if that is why. */
      resetsAt?: string | null;
    }
  | { type: 'item'; item: Record<string, unknown> }
  | { type: 'done'; dropped: number }
  | { type: 'error'; message: string };

/** Where an extraction has got to. */
export type ExtractionStatus = 'idle' | 'running' | 'done' | 'failed';
