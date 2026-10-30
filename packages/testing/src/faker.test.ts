import { describe, expect, it } from 'vitest';

import { FAKER_SEED, faker, resetFaker } from './faker.js';

describe('seeded faker', () => {
  it('AC1: produces the same sequence after a reset', () => {
    resetFaker();
    const first = [faker.person.firstName(), faker.person.firstName()];

    resetFaker();
    const second = [faker.person.firstName(), faker.person.firstName()];

    // Random test data makes a failure reproduce only sometimes, which is
    // worse than no data at all.
    expect(second).toStrictEqual(first);
  });

  it('AC2: advances the sequence between calls', () => {
    resetFaker();

    const values = faker.helpers.multiple(() => faker.string.uuid(), { count: 3 });

    expect(new Set(values).size).toBe(3);
  });

  it('AC3: exposes the seed, so a failure can be reproduced by hand', () => {
    expect(FAKER_SEED).toBe(20261030);
  });
});
