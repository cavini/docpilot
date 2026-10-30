/**
 * Rule overrides for the NestJS applications, applied on top of
 * {@link baseConfig}. Exported as a bare layer so a single root config can
 * scope it to the Nest workspaces with a `files` pattern.
 *
 * @type {import('typescript-eslint').ConfigArray}
 */
export const nestOverrides = [
  {
    rules: {
      // A Nest module is a class that carries only decorator metadata.
      '@typescript-eslint/no-extraneous-class': 'off',

      // Nest awaits lifecycle hooks and request handlers itself, so an
      // explicitly voided promise is a deliberate fire-and-forget.
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
    },
  },
];

export default nestOverrides;
