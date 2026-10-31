import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import ptBR from '../../messages/pt-BR.json';
import { routing } from './routing';

/** Flattens a message catalogue to dotted key paths. */
function keysOf(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;

    return [path, ...keysOf(child, path)];
  });
}

/** Every ICU placeholder in a message, such as `{count}`. */
function placeholdersOf(message: string): string[] {
  return [...message.matchAll(/\{(\w+)/g)].map((match) => match[1] ?? '').sort();
}

/** Every leaf string in a catalogue, by key path. */
function stringsOf(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') {
    return { [prefix]: value };
  }

  if (typeof value !== 'object' || value === null) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string>>((all, [key, child]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;

    return { ...all, ...stringsOf(child, path) };
  }, {});
}

/**
 * Key drift is invisible until a user sees a raw key, and it happens on every
 * change to the interface — so it is a test rather than a convention.
 */
describe('message catalogues', () => {
  it('AC1: have exactly the same keys', () => {
    const english = keysOf(en).sort();
    const portuguese = keysOf(ptBR).sort();

    expect(portuguese).toEqual(english);
  });

  it('exist for every configured locale', () => {
    expect([...routing.locales].sort()).toEqual(['en', 'pt-BR']);
  });

  it('carry the same placeholders in both languages', () => {
    // A translation that drops `{name}` renders a message missing the one
    // piece of information it was written to convey, and nothing complains.
    const english = stringsOf(en);
    const portuguese = stringsOf(ptBR);

    for (const [key, message] of Object.entries(english)) {
      expect({ key, placeholders: placeholdersOf(portuguese[key] ?? '') }).toEqual({
        key,
        placeholders: placeholdersOf(message),
      });
    }
  });

  it('have no empty strings, which render as a blank label', () => {
    for (const [key, message] of Object.entries(stringsOf(ptBR))) {
      expect({ key, empty: message.trim() === '' }).toEqual({ key, empty: false });
    }
  });

  it('are actually translated, not copied', () => {
    // A catalogue created by copying the English one passes every check above
    // while showing English to a Portuguese reader.
    const english = stringsOf(en);
    const portuguese = stringsOf(ptBR);
    const identical = Object.keys(english).filter((key) => english[key] === portuguese[key]);

    // Proper nouns and format strings legitimately match; most keys must not.
    expect(identical.length).toBeLessThan(Object.keys(english).length / 4);
  });
});
