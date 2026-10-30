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
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
];

export default nextOverrides;
