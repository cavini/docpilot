import tseslint from 'typescript-eslint';

import { baseConfig } from './base.js';

/**
 * ESLint configuration for the NestJS applications.
 *
 * @param {string} tsconfigRootDir Directory holding the app `tsconfig.json`.
 * @returns {import('typescript-eslint').ConfigArray} Flat config array.
 */
export function nestConfig(tsconfigRootDir) {
  return tseslint.config(
    baseConfig(tsconfigRootDir),
    {
      rules: {
        // A Nest module is a class with only decorator metadata on it.
        '@typescript-eslint/no-extraneous-class': 'off',

        // Nest resolves `OnModuleInit` and request handlers through the
        // framework, so a handler that returns a promise is normal.
        '@typescript-eslint/no-floating-promises': [
          'error',
          { ignoreVoid: true },
        ],
      },
    },
    {
      files: ['**/*.spec.ts', '**/test/**/*.ts'],
      rules: {
        // Test doubles routinely assert on shapes the compiler cannot prove.
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
  );
}

export default nestConfig;
