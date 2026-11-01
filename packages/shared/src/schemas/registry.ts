import { z } from 'zod';

import { type SchemaField } from './field.js';

/**
 * One endpoint, as described somewhere in the corpus.
 *
 * Deliberately small. A schema with twenty optional fields extracts twenty
 * fields' worth of guesses; four required ones either come back right or come
 * back empty.
 */
export const apiEndpointSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe('The HTTP method, uppercase.'),
  path: z.string().min(1).describe('The path, starting with a slash, such as /auth/token.'),
  summary: z.string().min(1).describe('One line on what the endpoint does.'),
  authenticated: z.boolean().describe('Whether the endpoint requires a token.'),
});

/** One heading in a document's structure. */
export const outlineEntrySchema = z.object({
  level: z.number().int().min(1).max(4).describe('Heading depth, 1 for a top-level heading.'),
  heading: z.string().min(1).describe('The heading, as written.'),
  gist: z.string().min(1).describe('One line on what that section covers.'),
});

/** A question the documents answer, with the answer. */
export const faqPairSchema = z.object({
  question: z.string().min(1).describe('A question the documents answer, phrased as a question.'),
  answer: z.string().min(1).describe('The answer, in one or two sentences, from the documents.'),
});

/** Everything the server needs to run and describe one extraction. */
export interface RegistryEntry {
  /** Human-readable name, for a chooser. */
  title: string;
  /** What the model is told it is looking for. */
  description: string;
  /** What to retrieve when the caller gives no query. */
  defaultQuery: string;
  /** Validates one item. */
  item: z.ZodType;
  /** Columns, for a table. */
  fields: readonly SchemaField[];
  /** Identity of an item, for deduplication across passages. */
  identity: (item: unknown) => string;
}

/**
 * Shapes the server knows how to extract.
 *
 * **A registry, not a schema the caller supplies.** A caller-supplied schema
 * is a caller-supplied contract: nothing downstream could rely on it, and it
 * would make the endpoint a way to ask the server for arbitrary shapes.
 *
 * It lives in `packages/shared` rather than in the API because the web app
 * needs the same definitions to lay out a table of each shape. One
 * definition, used by the server to validate and by the client to render —
 * so adding a schema needs no front-end release.
 */
export const SCHEMA_REGISTRY = {
  api_endpoints: {
    title: 'API endpoints',
    description:
      'Every HTTP endpoint the documents describe, with its method, path, a ' +
      'one-line summary, and whether it needs authentication.',
    defaultQuery: 'HTTP endpoints, methods, paths, authentication',
    item: apiEndpointSchema,
    fields: [
      {
        name: 'method',
        kind: 'enum',
        label: 'Method',
        options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      },
      { name: 'path', kind: 'string', label: 'Path' },
      { name: 'summary', kind: 'text', label: 'Summary' },
      { name: 'authenticated', kind: 'boolean', label: 'Auth' },
    ],
    identity: (item) => {
      const endpoint = item as z.infer<typeof apiEndpointSchema>;

      return `${endpoint.method} ${endpoint.path}`;
    },
  },

  document_outline: {
    title: 'Document outline',
    description:
      "The documents' headings, each with its depth and a one-line summary of " +
      'what that section covers.',
    defaultQuery: 'section headings, structure, what each part covers',
    item: outlineEntrySchema,
    fields: [
      { name: 'level', kind: 'number', label: 'Level' },
      { name: 'heading', kind: 'string', label: 'Heading' },
      { name: 'gist', kind: 'text', label: 'Covers' },
    ],
    identity: (item) => {
      const entry = item as z.infer<typeof outlineEntrySchema>;

      // By heading alone, not heading plus level: the same section found twice
      // at different depths is still one section.
      return entry.heading.trim().toLowerCase();
    },
  },

  faq_pairs: {
    title: 'Questions and answers',
    description:
      'Questions the documents answer, each with its answer. Only questions ' +
      'the documents actually address.',
    defaultQuery: 'common questions, how do I, what happens when',
    item: faqPairSchema,
    fields: [
      { name: 'question', kind: 'text', label: 'Question' },
      { name: 'answer', kind: 'text', label: 'Answer' },
    ],
    identity: (item) => {
      const pair = item as z.infer<typeof faqPairSchema>;

      return pair.question.trim().toLowerCase();
    },
  },
} as const satisfies Record<string, RegistryEntry>;

/** Name of a schema in the registry. */
export type SchemaName = keyof typeof SCHEMA_REGISTRY;

/** Every name the registry knows, for an error message that helps. */
export const SCHEMA_NAMES = Object.keys(SCHEMA_REGISTRY) as SchemaName[];

/**
 * Whether a name is one the registry knows.
 *
 * `Object.hasOwn` rather than `in`, or a caller naming `toString` would pass
 * the check and crash on the lookup.
 */
export function isSchemaName(name: string): name is SchemaName {
  return Object.hasOwn(SCHEMA_REGISTRY, name);
}

/**
 * Looks up a registry entry, widened.
 *
 * `SCHEMA_REGISTRY[name]` resolves to the union of every entry, so its `item`
 * is a union of three concrete Zod objects — which nothing generic over a
 * single element type will accept. This hands back the common shape, which is
 * what every caller actually wants: the entry as `RegistryEntry`, not as one
 * particular entry.
 *
 * @param name A name the registry knows.
 * @returns Its entry.
 *
 * @example
 * ```ts
 * const entry = schemaEntry('api_endpoints');
 * ```
 */
export function schemaEntry(name: SchemaName): RegistryEntry {
  return SCHEMA_REGISTRY[name];
}

/** What survived validation, and what did not. */
export interface ValidatedItems {
  items: unknown[];
  dropped: number;
}

/**
 * Validates and deduplicates what a model produced.
 *
 * A second line of defence. The AI SDK already constrains the provider to the
 * schema and rejects a response that does not match — but providers differ in
 * how strictly they enforce one, and a provider that passes an almost-right
 * item through would otherwise send it to a caller who finds out later and
 * elsewhere.
 *
 * An item that fails is **dropped and counted** rather than failing the call:
 * one bad endpoint among ten good ones is still nine endpoints, and the count
 * tells the caller something was lost.
 *
 * @param produced What the model returned.
 * @param entry The registry entry being extracted.
 * @returns The valid, deduplicated items and how many were dropped.
 */
export function validateItems(produced: unknown[], entry: RegistryEntry): ValidatedItems {
  const items: unknown[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const candidate of produced) {
    const parsed = entry.item.safeParse(candidate);

    if (!parsed.success) {
      dropped += 1;
      continue;
    }

    const identity = entry.identity(parsed.data);

    if (seen.has(identity)) {
      continue;
    }

    seen.add(identity);
    items.push(parsed.data);
  }

  return { items, dropped };
}
