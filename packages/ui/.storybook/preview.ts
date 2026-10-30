import type { Preview } from '@storybook/react-vite';

import '../src/styles/index.css';

const preview: Preview = {
  parameters: {
    controls: { expanded: true },
    // Every story is checked for accessibility violations, so a contrast or
    // labelling mistake fails in review rather than in production.
    a11y: { test: 'error' },
  },
  initialGlobals: {
    backgrounds: { value: 'surface' },
  },
};

export default preview;
