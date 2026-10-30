import { Inject, Injectable } from '@nestjs/common';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';

/** Flags the application can be asked about. */
export const FEATURE_FLAGS = ['rerank', 'graphql', 'agentTools', 'publicUploads'] as const;

/** Name of a feature flag. */
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/** A flag and whether it is on. */
export interface FeatureFlagState {
  key: FeatureFlag;
  enabled: boolean;
  description: string;
}

/** What each flag controls, shown by `GET /feature-flags`. */
const DESCRIPTIONS: Record<FeatureFlag, string> = {
  rerank: 'Re-score retrieved chunks with a second model before answering',
  graphql: 'Serve the GraphQL read API',
  agentTools: 'Let the assistant call tools rather than only answering',
  publicUploads: 'Accept document uploads from unauthenticated callers',
};

/**
 * Reads feature flags.
 *
 * Flags exist so a risky or expensive capability can be turned off on the
 * public demo without a redeploy, and so a half-built feature can be merged
 * into `main` behind an off switch rather than living on a long branch.
 *
 * In M0 the values come from the environment only. Database overrides, which
 * allow a flag to be flipped at runtime, arrive with the ingestion and agent
 * features that need them.
 */
@Injectable()
export class FeatureFlagsService {
  private readonly defaults: Record<FeatureFlag, boolean>;

  constructor(@Inject(ENV) env: Env) {
    this.defaults = {
      rerank: env.FF_RERANK,
      graphql: env.FF_GRAPHQL,
      agentTools: env.FF_AGENT_TOOLS,
      publicUploads: env.FF_PUBLIC_UPLOADS,
    };
  }

  /**
   * Whether `flag` is on.
   *
   * @param flag Flag to read.
   * @returns `true` when the capability is enabled.
   *
   * @example
   * ```ts
   * if (this.flags.isEnabled('rerank')) { ... }
   * ```
   */
  isEnabled(flag: FeatureFlag): boolean {
    return this.defaults[flag];
  }

  /** Every flag with its current value, for the read-only endpoint. */
  all(): FeatureFlagState[] {
    return FEATURE_FLAGS.map((key) => ({
      key,
      enabled: this.defaults[key],
      description: DESCRIPTIONS[key],
    }));
  }
}
