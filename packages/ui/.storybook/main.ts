import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook configuration for the design system.
 *
 * Stories are the component catalogue and the test fixture at the same time:
 * `@storybook/addon-vitest` runs every story's `play` function as a Vitest
 * test in a real browser, so a state that is documented is also covered.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  core: {
    // Nothing in this repository phones home, including from CI.
    disableTelemetry: true,
  },
  typescript: {
    // Reads prop types and TSDoc from the source, so the generated docs cannot
    // drift from the component's actual API.
    reactDocgen: 'react-docgen-typescript',
  },
};

export default config;
