import { type Env } from '../config/env.schema.js';
import { FeatureFlagsController } from './feature-flags.controller.js';
import { FeatureFlagsService } from './feature-flags.service.js';

const env = {
  FF_RERANK: false,
  FF_GRAPHQL: true,
  FF_AGENT_TOOLS: true,
  FF_PUBLIC_UPLOADS: false,
} as Env;

describe('FeatureFlagsController', () => {
  const controller = new FeatureFlagsController(new FeatureFlagsService(env));

  it('AC1: lists every flag with its current value', () => {
    expect(controller.list()).toStrictEqual([
      { key: 'rerank', enabled: false, description: expect.any(String) },
      { key: 'graphql', enabled: true, description: expect.any(String) },
      { key: 'agentTools', enabled: true, description: expect.any(String) },
      { key: 'publicUploads', enabled: false, description: expect.any(String) },
    ]);
  });

  it('AC2: describes what each flag controls, so the response is self explanatory', () => {
    for (const flag of controller.list()) {
      expect(flag.description.length).toBeGreaterThan(10);
    }
  });
});
