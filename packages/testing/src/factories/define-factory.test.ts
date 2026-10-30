import { beforeEach, describe, expect, it } from 'vitest';

import { defineFactory } from './define-factory.js';

interface User {
  id: string;
  name: string;
  active: boolean;
}

describe('defineFactory', () => {
  const userFactory = defineFactory<User>((sequence) => ({
    id: `user-${String(sequence)}`,
    name: 'Ada',
    active: true,
  }));

  beforeEach(() => {
    userFactory.reset();
  });

  it('AC1: builds an object with every field populated', () => {
    expect(userFactory.build()).toStrictEqual({ id: 'user-1', name: 'Ada', active: true });
  });

  it('AC2: applies overrides over the defaults', () => {
    expect(userFactory.build({ name: 'Grace' }).name).toBe('Grace');
  });

  it('AC3: keeps defaults for fields the caller did not override', () => {
    expect(userFactory.build({ name: 'Grace' }).active).toBe(true);
  });

  it('AC4: gives each object a distinct sequence number', () => {
    expect([userFactory.build().id, userFactory.build().id]).toStrictEqual(['user-1', 'user-2']);
  });

  it('AC5: builds many objects, each with its own sequence number', () => {
    expect(userFactory.buildMany(3).map((user) => user.id)).toStrictEqual([
      'user-1',
      'user-2',
      'user-3',
    ]);
  });

  it('AC6: applies shared overrides to every object in a batch', () => {
    const users = userFactory.buildMany(2, { active: false });

    expect(users.every((user) => !user.active)).toBe(true);
  });

  it('AC7: restarts the sequence on reset, so a test is reproducible', () => {
    userFactory.build();
    userFactory.reset();

    expect(userFactory.build().id).toBe('user-1');
  });

  it('AC8: returns a fresh object each time, so mutating one cannot affect another', () => {
    const first = userFactory.build();
    const second = userFactory.build();

    first.name = 'changed';

    expect(second.name).toBe('Ada');
  });

  it('AC9: allows an override to an explicitly falsy value', () => {
    expect(userFactory.build({ active: false }).active).toBe(false);
  });

  it('AC10: builds an empty list when asked for none', () => {
    expect(userFactory.buildMany(0)).toStrictEqual([]);
  });
});
