import { describe, expect, it } from 'vitest';

import {
  SCHEMA_NAMES,
  SCHEMA_REGISTRY,
  apiEndpointSchema,
  faqPairSchema,
  isSchemaName,
  outlineEntrySchema,
  schemaEntry,
  validateItems,
} from './registry';

describe('the schema registry', () => {
  it('knows the three M5 schemas', () => {
    expect(SCHEMA_NAMES).toEqual(['api_endpoints', 'document_outline', 'faq_pairs']);
  });

  it('AC2: does not know a name it was not given', () => {
    expect(isSchemaName('whatever_the_caller_invented')).toBe(false);
  });

  it('is not fooled by an inherited property name', () => {
    // `'toString' in registry` is true for every object; the registry has to
    // answer for its own keys only, or a caller naming a prototype method
    // would pass the check and crash on the lookup.
    expect(isSchemaName('toString')).toBe(false);
    expect(isSchemaName('constructor')).toBe(false);
  });

  it.each(SCHEMA_NAMES)('%s is fully described', (name) => {
    const entry = schemaEntry(name);

    expect(entry.title.length).toBeGreaterThan(0);
    expect(entry.description.length).toBeGreaterThan(0);
    expect(entry.defaultQuery.length).toBeGreaterThan(0);
    expect(entry.fields.length).toBeGreaterThan(0);
  });

  it.each(SCHEMA_NAMES)('%s names a column for every field it validates', (name) => {
    // A field with no column is extracted and then invisible; a column with
    // no field renders empty. Either is a silent mismatch between what the
    // server validates and what the client lays out.
    const entry = schemaEntry(name);
    const shape = Object.keys(
      (entry.item as unknown as { shape: Record<string, unknown> }).shape,
    ).sort();

    expect(entry.fields.map((field) => field.name).sort()).toEqual(shape);
  });

  it.each(SCHEMA_NAMES)('%s gives every enum field its options', (name) => {
    // An enum column with no options cannot be rendered as a chooser, and
    // nothing would say why.
    for (const field of schemaEntry(name).fields) {
      if (field.kind === 'enum') {
        expect(field.options ?? []).not.toHaveLength(0);
      }
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

  it('rejects a method it does not know', () => {
    expect(apiEndpointSchema.safeParse({ ...endpoint, method: 'TRACE' }).success).toBe(false);
  });

  it('rejects a lowercase method rather than quietly accepting it', () => {
    // Two spellings of the same endpoint would both survive deduplication.
    expect(apiEndpointSchema.safeParse({ ...endpoint, method: 'post' }).success).toBe(false);
  });

  it('identifies an endpoint by method and path', () => {
    const { identity } = SCHEMA_REGISTRY.api_endpoints;

    expect(identity(endpoint)).toBe('POST /auth/token');
    expect(identity({ ...endpoint, summary: 'worded differently' })).toBe(identity(endpoint));
  });
});

describe('outlineEntrySchema', () => {
  const entry = { level: 2, heading: 'Authentication', gist: 'How to get a token.' };

  it('accepts a well-formed entry', () => {
    expect(outlineEntrySchema.safeParse(entry).success).toBe(true);
  });

  it('rejects a level outside the range a document can have', () => {
    expect(outlineEntrySchema.safeParse({ ...entry, level: 0 }).success).toBe(false);
    expect(outlineEntrySchema.safeParse({ ...entry, level: 9 }).success).toBe(false);
  });

  it('identifies a section by its heading alone, ignoring case and spacing', () => {
    // The same section found twice at different depths is still one section.
    const { identity } = SCHEMA_REGISTRY.document_outline;

    expect(identity({ ...entry, level: 3, heading: '  AUTHENTICATION ' })).toBe(identity(entry));
  });
});

describe('faqPairSchema', () => {
  const pair = { question: 'How do I authenticate?', answer: 'With a bearer token.' };

  it('accepts a well-formed pair', () => {
    expect(faqPairSchema.safeParse(pair).success).toBe(true);
  });

  it('rejects an empty answer, which is a question with no answer', () => {
    expect(faqPairSchema.safeParse({ ...pair, answer: '' }).success).toBe(false);
  });

  it('identifies a pair by its question', () => {
    const { identity } = SCHEMA_REGISTRY.faq_pairs;

    expect(identity({ ...pair, answer: 'worded differently' })).toBe(identity(pair));
  });
});

describe('validateItems', () => {
  const entry = SCHEMA_REGISTRY.api_endpoints;
  const endpoint = {
    method: 'POST',
    path: '/auth/token',
    summary: 'Exchange credentials for a bearer token.',
    authenticated: false,
  };

  it('keeps items that validate', () => {
    expect(validateItems([endpoint], entry)).toEqual({ items: [endpoint], dropped: 0 });
  });

  it('drops an item that does not, and counts it', () => {
    // One bad endpoint among ten good ones is still nine endpoints, and the
    // count says something was lost.
    const bad = { method: 'TRACE', path: '/x', summary: 's', authenticated: false };

    expect(validateItems([endpoint, bad], entry)).toEqual({ items: [endpoint], dropped: 1 });
  });

  it('deduplicates the same item found in two passages', () => {
    const result = validateItems([endpoint, { ...endpoint, summary: 'different' }], entry);

    expect(result.items).toHaveLength(1);
    // A duplicate is not a drop: nothing was lost.
    expect(result.dropped).toBe(0);
  });

  it('keeps the first wording of a duplicate, not the last', () => {
    const result = validateItems([endpoint, { ...endpoint, summary: 'second' }], entry);

    expect(result.items[0]).toEqual(endpoint);
  });

  it('returns nothing for nothing', () => {
    expect(validateItems([], entry)).toEqual({ items: [], dropped: 0 });
  });
});
