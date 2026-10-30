import { faker } from '@faker-js/faker';

/**
 * Seed every generator starts from.
 *
 * Fixed so that a factory called without overrides produces the same values on
 * every run and on every machine. Random test data makes a failure reproduce
 * only sometimes, which is worse than no data at all.
 */
export const FAKER_SEED = 20261030;

/**
 * Resets the shared generator to its seed.
 *
 * Call it in a `beforeEach` when a test asserts on generated values, so one
 * test's consumption of the sequence cannot shift another's.
 *
 * @example
 * ```ts
 * beforeEach(() => { resetFaker(); });
 * ```
 */
export function resetFaker(): void {
  faker.seed(FAKER_SEED);
}

resetFaker();

export { faker };
