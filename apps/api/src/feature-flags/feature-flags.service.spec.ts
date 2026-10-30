import { type Env } from '../config/env.schema.js';
import { FEATURE_FLAGS, FeatureFlagsService } from './feature-flags.service.js';

const envWith = (overrides: Partial<Env>): Env =>
  ({
    FF_RERANK: false,
    FF_GRAPHQL: true,
    FF_AGENT_TOOLS: true,
    FF_PUBLIC_UPLOADS: true,
    ...overrides,
  }) as Env;

describe('FeatureFlagsService', () => {
  it('AC1: reads each flag from its environment variable', () => {
    const service = new FeatureFlagsService(envWith({ FF_RERANK: true }));

    expect(service.isEnabled('rerank')).toBe(true);
    expect(service.isEnabled('graphql')).toBe(true);
  });

  it('AC2: reports a disabled flag as off', () => {
    const service = new FeatureFlagsService(envWith({ FF_AGENT_TOOLS: false }));

    expect(service.isEnabled('agentTools')).toBe(false);
  });

  it('AC3: lists every known flag, so none can be silently unexposed', () => {
    const service = new FeatureFlagsService(envWith({}));

    expect(service.all().map((flag) => flag.key)).toStrictEqual([...FEATURE_FLAGS]);
  });

  it('AC4: describes what each flag controls', () => {
    const service = new FeatureFlagsService(envWith({}));

    for (const flag of service.all()) {
      expect(flag.description.length).toBeGreaterThan(0);
    }
  });

  it('AC5: reports values that match the environment it was built from', () => {
    const service = new FeatureFlagsService(
      envWith({ FF_RERANK: true, FF_GRAPHQL: false, FF_PUBLIC_UPLOADS: false }),
    );

    expect(service.all()).toStrictEqual([
      { key: 'rerank', enabled: true, description: expect.any(String) },
      { key: 'graphql', enabled: false, description: expect.any(String) },
      { key: 'agentTools', enabled: true, description: expect.any(String) },
      { key: 'publicUploads', enabled: false, description: expect.any(String) },
    ]);
  });
});
