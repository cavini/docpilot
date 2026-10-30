/** Builds one object, given its sequence number. */
export type FactoryBuilder<T> = (sequence: number) => T;

/** A factory for test objects of type `T`. */
export interface Factory<T> {
  /**
   * Builds one object.
   *
   * @param overrides Fields to replace on the generated object.
   */
  build: (overrides?: Partial<T>) => T;

  /**
   * Builds several objects, each with its own sequence number.
   *
   * @param count How many to build.
   * @param overrides Fields applied to every object.
   */
  buildMany: (count: number, overrides?: Partial<T>) => T[];

  /** Restarts the sequence, so ids and names repeat from the beginning. */
  reset: () => void;
}

/**
 * Creates a factory that produces valid objects with sensible defaults.
 *
 * Tests should state only the fields they care about. A factory supplies the
 * rest, so adding a required field to a type means changing one builder rather
 * than every test that constructs the object, and a test's assertions stay
 * about the thing it is actually testing.
 *
 * Each call receives an incrementing sequence number, so generated identifiers
 * and names are unique within a run without being random.
 *
 * @param builder Produces the default object for a sequence number.
 * @returns A factory with `build`, `buildMany` and `reset`.
 *
 * @example
 * ```ts
 * const userFactory = defineFactory((n) => ({ id: `user-${n}`, name: 'Ada' }));
 *
 * userFactory.build();                   // { id: 'user-1', name: 'Ada' }
 * userFactory.build({ name: 'Grace' });  // { id: 'user-2', name: 'Grace' }
 * ```
 */
export function defineFactory<T extends object>(builder: FactoryBuilder<T>): Factory<T> {
  let sequence = 0;

  const build = (overrides: Partial<T> = {}): T => {
    sequence += 1;
    return { ...builder(sequence), ...overrides };
  };

  return {
    build,
    buildMany: (count, overrides) => Array.from({ length: count }, () => build(overrides)),
    reset: () => {
      sequence = 0;
    },
  };
}
