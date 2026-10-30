import nextPlugin from '@next/eslint-plugin-next';

import { reactOverrides } from './react.js';

/**
 * The React rules plus Next's own checks for routing, images and fonts,
 * applied on top of {@link baseConfig}.
 *
 * @type {import('typescript-eslint').ConfigArray}
 */
export const nextOverrides = [
  ...reactOverrides,
  {
    plugins: { '@next/next': nextPlugin },
    // The plugin looks for a `pages` directory relative to this, and without
    // it the rule searches the monorepo root and warns on every run.
    settings: { next: { rootDir: 'apps/web' } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
];

export default nextOverrides;
