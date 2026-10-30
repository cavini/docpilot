import nextPlugin from '@next/eslint-plugin-next';
import tseslint from 'typescript-eslint';

import { reactConfig } from './react.js';

/**
 * ESLint configuration for the Next.js application: the React rules plus
 * Next's own checks for routing, images and fonts.
 *
 * @param {string} tsconfigRootDir Directory holding the app `tsconfig.json`.
 * @returns {import('typescript-eslint').ConfigArray} Flat config array.
 */
export function nextConfig(tsconfigRootDir) {
  return tseslint.config(reactConfig(tsconfigRootDir), {
    files: ['**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  });
}

export default nextConfig;
