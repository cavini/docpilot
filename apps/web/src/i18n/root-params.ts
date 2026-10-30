import * as rootParams from 'next/root-params';

/** The root parameters this application's route tree declares. */
interface RootParams {
  /** Value of the `[locale]` segment for the route being rendered. */
  locale: () => Promise<string | undefined>;
}

/**
 * Reads the `[locale]` route parameter.
 *
 * Next generates typed declarations for `next/root-params` into
 * `.next/types`, but it also ships `declare module 'next/root-params'` as a
 * shorthand ambient module in the package itself. The shorthand resolves
 * first, so every import from that module is `any` whether or not the
 * generated types exist. Narrowing it once here keeps that single assertion
 * next to its explanation instead of letting `any` spread through the i18n
 * setup.
 *
 * @returns The locale segment, or `undefined` outside a localised route.
 */
export function localeParam(): Promise<string | undefined> {
  return (rootParams as RootParams).locale();
}
