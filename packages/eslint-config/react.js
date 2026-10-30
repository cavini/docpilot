import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { baseConfig } from './base.js';

/**
 * ESLint configuration for React libraries: hook correctness plus the
 * accessibility rules that catch the markup mistakes a screen reader trips on.
 *
 * @param {string} tsconfigRootDir Directory holding the workspace `tsconfig.json`.
 * @returns {import('typescript-eslint').ConfigArray} Flat config array.
 */
export function reactConfig(tsconfigRootDir) {
  return tseslint.config(
    baseConfig(tsconfigRootDir),
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: {
        globals: { ...globals.browser },
      },
      extends: [reactHooks.configs['recommended-latest'], jsxA11y.flatConfigs.recommended],
    },
    {
      files: ['**/*.{test,spec}.{ts,tsx}', '**/*.stories.{ts,tsx}'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
      },
    },
  );
}

export default reactConfig;
