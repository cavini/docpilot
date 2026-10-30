import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * Hook-correctness and accessibility rules for React code, applied on top of
 * {@link baseConfig}. The accessibility plugin catches the markup mistakes a
 * screen reader trips on before they reach a component test.
 *
 * @type {import('typescript-eslint').ConfigArray}
 */
export const reactOverrides = [
  reactHooks.configs['recommended-latest'],
  jsxA11y.flatConfigs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];

export default reactOverrides;
