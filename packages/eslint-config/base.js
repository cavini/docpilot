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
    {
      // Config files sit outside every tsconfig `include`, so the project
      // service cannot type them. They do not need type-aware rules either.
      files: ['**/*.{js,mjs,cjs}', '**/*.config.{ts,mts,cts}'],
      extends: [tseslint.configs.disableTypeChecked],
    },
    prettier,
  );
}

export default baseConfig;
