import { describe, expect, it } from 'vitest';

import { rollUpHealthStatus } from './health-status.js';
import { type DependencyHealth } from './health.schema.js';

const dependency = (status: DependencyHealth['status']): DependencyHealth => ({ status });

describe('rollUpHealthStatus', () => {
  it('AC1: reports ok when every dependency is ok', () => {
    expect(rollUpHealthStatus([dependency('ok'), dependency('ok')])).toBe('ok');
  });

  it('AC2: reports degraded when a dependency is degraded and none is down', () => {
    expect(rollUpHealthStatus([dependency('ok'), dependency('degraded')])).toBe('degraded');
  });

  it('AC3: reports down when any dependency is down, whatever else reports', () => {
    expect(rollUpHealthStatus([dependency('ok'), dependency('degraded'), dependency('down')])).toBe(
      'down',
    );
  });

  it('AC4: reports ok for an empty list, because nothing was probed', () => {
    expect(rollUpHealthStatus([])).toBe('ok');
  });

  it('AC5: does not depend on the order dependencies are probed in', () => {
    const statuses = [dependency('down'), dependency('ok'), dependency('degraded')];

    expect(rollUpHealthStatus(statuses)).toBe('down');
    expect(rollUpHealthStatus([...statuses].reverse())).toBe('down');
  });
});
