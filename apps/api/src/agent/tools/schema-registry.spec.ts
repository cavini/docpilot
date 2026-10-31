import {
  SCHEMA_NAMES,
  SCHEMA_REGISTRY,
  apiEndpointSchema,
  isSchemaName,
} from './schema-registry.js';

describe('the schema registry', () => {
  it('knows api_endpoints', () => {
    expect(isSchemaName('api_endpoints')).toBe(true);
  });

  it('AC2: does not know a name it was not given', () => {
    expect(isSchemaName('whatever_the_model_invented')).toBe(false);
  });

  it('is not fooled by an inherited property name', () => {
    // `'toString' in registry` is true for every object; the registry has to
    // answer for its own keys only, or a model naming a prototype method
    // would pass the check and crash on the lookup.
    expect(isSchemaName('toString')).toBe(false);
    expect(isSchemaName('constructor')).toBe(false);
  });

  it('lists its names, so an error can say what is available', () => {
    expect(SCHEMA_NAMES).toEqual(['api_endpoints']);
  });

  it('gives every entry a default query, so the tool works with no query', () => {
    for (const name of SCHEMA_NAMES) {
      expect(SCHEMA_REGISTRY[name].defaultQuery.length).toBeGreaterThan(0);
    }
  });
});

describe('apiEndpointSchema', () => {
  const endpoint = {
    method: 'POST',
    path: '/auth/token',
    summary: 'Exchange credentials for a bearer token.',
    authenticated: false,
  };

  it('accepts a well-formed endpoint', () => {
    expect(apiEndpointSchema.safeParse(endpoint).success).toBe(true);
  });

  it('AC3: rejects a method it does not know', () => {
    expect(apiEndpointSchema.safeParse({ ...endpoint, method: 'TRACE' }).success).toBe(false);
  });

  it('AC3: rejects a lowercase method, rather than quietly accepting it', () => {
    // Two spellings of the same endpoint would both survive deduplication.
    expect(apiEndpointSchema.safeParse({ ...endpoint, method: 'post' }).success).toBe(false);
  });

  it('AC3: rejects a missing field', () => {
    const incomplete: Record<string, unknown> = { ...endpoint };
    delete incomplete.authenticated;

    expect(apiEndpointSchema.safeParse(incomplete).success).toBe(false);
  });

  it('AC3: rejects an empty path', () => {
    expect(apiEndpointSchema.safeParse({ ...endpoint, path: '' }).success).toBe(false);
  });

  it('identifies an endpoint by method and path, for deduplication', () => {
    const identity = SCHEMA_REGISTRY.api_endpoints.identity;

    expect(identity(endpoint)).toBe('POST /auth/token');
    expect(identity({ ...endpoint, summary: 'worded differently' })).toBe(identity(endpoint));
  });
});
