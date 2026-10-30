import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Paths that are generated, vendored or built, and that no workspace should
 * ever lint.
 */
export const commonIgnores = [
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/storybook-static/**',
  '**/node_modules/**',
  '**/*.generated.ts',
];

/**
 * Type-aware ESLint configuration shared by every workspace.
 *
 * Rules that duplicate a compiler check are left to the compiler, and
 * formatting is left entirely to Prettier, so a lint failure always means a
 * real code problem rather than a style preference.
 *
 * @param {string} tsconfigRootDir Directory holding the workspace `tsconfig.json`,
 *   normally `import.meta.dirname` of the consuming `eslint.config.js`.
 * @returns {import('typescript-eslint').ConfigArray} Flat config array.
 */
export function baseConfig(tsconfigRootDir) {
  return tseslint.config(
    { ignores: commonIgnores },
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: {
        // `unknown` plus narrowing instead of `any`, everywhere.
        '@typescript-eslint/no-explicit-any': 'error',

        // Suppressing a compiler error is allowed only with a stated reason.
        '@typescript-eslint/ban-ts-comment': [
          'error',
          {
            'ts-expect-error': 'allow-with-description',
            'ts-ignore': true,
            'ts-nocheck': true,
            minimumDescriptionLength: 10,
          },
        ],

        // An underscore prefix marks a binding that exists only to be skipped.
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
          },
        ],

        // Keeps type-only imports erasable, which matters for decorator
        // metadata and for bundlers that strip types without a type checker.
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],

        // Application code logs through pino, not the console.
        'no-console': 'error',

        eqeqeq: ['error', 'always', { null: 'ignore' }],
        'no-param-reassign': 'error',
        'prefer-const': 'error',
      },
    },
    {
      // Config and script files run outside the application and may print.
      files: ['**/*.config.{js,ts,mjs,cjs}', '**/scripts/**/*.ts'],
      rules: { 'no-console': 'off' },
    },
    prettier,
  );
}

/**
 * Relaxations for test files.
 *
 * Test doubles are deliberately shaped like the thing they stand in for
 * without being it, so the rules that protect production call sites get in the
 * way here. Passing `logger.warn` to `expect()` is the common case: it is an
 * unbound method reference on purpose. `no-explicit-any` stays on, because a
 * test that needs `any` is usually a test asserting the wrong thing.
 *
 * @type {import('typescript-eslint').ConfigArray}
 */
export const testFileOverrides = tseslint.config({
  files: [
    '**/*.spec.{ts,tsx}',
    '**/*.test.{ts,tsx}',
    '**/test/**/*.{ts,tsx}',
    '**/e2e/**/*.{ts,tsx}',
    '**/cypress/**/*.{ts,tsx}',
  ],
  rules: {
    '@typescript-eslint/unbound-method': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
  },
});

/**
 * Turns off type-aware rules for files no tsconfig includes: plain JavaScript,
 * and the config files that live at a workspace root.
 *
 * Flat config applies layers in order, so this **must be the last layer** in
 * the final config. Any scoped layer placed after it can re-enable a
 * type-aware rule for a file the project service cannot type, which makes
 * ESLint fail on the file rather than report a problem in it.
 *
 * @type {import('typescript-eslint').ConfigArray}
 */
export const untypedFileOverrides = tseslint.config({
  files: ['**/*.{js,mjs,cjs}', '**/*.config.{ts,mts,cts}'],
  extends: [tseslint.configs.disableTypeChecked],
});

export default baseConfig;
