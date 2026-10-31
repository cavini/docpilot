import { z } from 'zod';

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

/** One extractable shape. */
interface RegistryEntry {
  /** What to retrieve before extracting, when the caller gives no query. */
  defaultQuery: string;
  /** What the model is told it is looking for. */
  description: string;
  /** Validates one item. */
  item: z.ZodType;
  /** Identity of an item, for deduplication across passages. */
  identity: (item: unknown) => string;
}

/**
 * Shapes the server knows how to extract.
 *
 * **A registry, not a schema the model supplies.** A model-supplied schema is
 * a model-supplied contract: nothing downstream could rely on it, and it would
 * be a way to make the server produce arbitrary shapes on request. Naming a
 * known schema keeps the contract the server's.
 *
 * M4 ships one entry. M5 adds the rest and an endpoint that exposes the
 * registry directly, which is why this is a map rather than a constant.
 */
export const SCHEMA_REGISTRY = {
  api_endpoints: {
    defaultQuery: 'HTTP endpoints, methods, paths, authentication',
    description:
      'Every HTTP endpoint the documents describe, with its method, path, a ' +
      'one-line summary, and whether it needs authentication.',
    item: apiEndpointSchema,
    identity: (item) => {
      const endpoint = item as z.infer<typeof apiEndpointSchema>;

      return `${endpoint.method} ${endpoint.path}`;
    },
  },
} as const satisfies Record<string, RegistryEntry>;

/** Name of a schema in the registry. */
export type SchemaName = keyof typeof SCHEMA_REGISTRY;

/** Every name the registry knows, for an error message that helps. */
export const SCHEMA_NAMES = Object.keys(SCHEMA_REGISTRY) as SchemaName[];

/** Whether a name is one the registry knows. */
export function isSchemaName(name: string): name is SchemaName {
  return Object.hasOwn(SCHEMA_REGISTRY, name);
}
