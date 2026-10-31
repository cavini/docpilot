import { describe, expect, it } from 'vitest';

import { formatBytes, formatTimestamp } from './format';

describe('formatBytes', () => {
  it('AC5: uses the locale decimal separator', () => {
    // Hand-assembling a number and a unit is how a localised interface ends up
    // with an English-looking number, so this is the point of the function.
    expect(formatBytes(1_200_000, 'en')).toContain('1.2');
    expect(formatBytes(1_200_000, 'pt-BR')).toContain('1,2');
  });

  it('scales to the right unit', () => {
    expect(formatBytes(512, 'en')).toMatch(/512/);
    expect(formatBytes(2_048, 'en')).toMatch(/2/);
    expect(formatBytes(5_000_000, 'en')).toMatch(/5/);
  });

  it('shows no fraction for a plain byte count', () => {
    expect(formatBytes(512, 'en')).not.toContain('.');
  });

  it('handles zero', () => {
    expect(formatBytes(0, 'en')).toMatch(/0/);
  });

  it('uses decimal prefixes, matching what the file picker showed a second ago', () => {
    // 1000 bytes is 1 kB here, not 0.98 KiB.
    expect(formatBytes(1_000, 'en')).toMatch(/^1\b/);
  });
});

describe('formatTimestamp', () => {
  it('AC4: formats for the locale', () => {
    const iso = '2026-10-30T14:05:00.000Z';

    expect(formatTimestamp(iso, 'en')).not.toEqual(formatTimestamp(iso, 'pt-BR'));
  });

  it('includes both a date and a time', () => {
    const formatted = formatTimestamp('2026-10-30T14:05:00.000Z', 'en');

    expect(formatted).toMatch(/2026/);
    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
  });
});
