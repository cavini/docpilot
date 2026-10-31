/**
 * Formats a byte count for the active locale.
 *
 * Uses `Intl.NumberFormat` with its `unit` style rather than concatenating a
 * rounded number and a unit string, so the decimal separator follows the
 * locale: `1,2 MB` in pt-BR and `1.2 MB` in English. Hand-assembling it is the
 * usual way a localised interface ends up with an English-looking number.
 *
 * Binary prefixes (KiB, MiB) are not used. Operating systems and the file
 * picker the reader just came from report decimal megabytes, and matching what
 * they saw a second ago matters more than being technically precise.
 *
 * @param bytes Size in bytes.
 * @param locale BCP 47 tag.
 * @returns A localised size, such as `1.2 MB`.
 *
 * @example
 * ```ts
 * formatBytes(1_200_000, 'pt-BR'); // '1,2 MB'
 * ```
 */
export function formatBytes(bytes: number, locale: string): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
  let value = bytes;
  let unit = 0;

  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }

  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: units[unit],
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}

/**
 * Formats a timestamp as a short localised date and time.
 *
 * @param iso An ISO 8601 timestamp from the API.
 * @param locale BCP 47 tag.
 * @returns A localised date and time.
 */
export function formatTimestamp(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}
