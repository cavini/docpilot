import { baseConfig, testFileOverrides, untypedFileOverrides } from '@docpilot/eslint-config/base';
import { nestOverrides } from '@docpilot/eslint-config/nest';
import { nextOverrides } from '@docpilot/eslint-config/next';
import { reactOverrides } from '@docpilot/eslint-config/react';
import tseslint from 'typescript-eslint';

/**
 * One flat config for the whole monorepo.
 *
 * ESLint's project service resolves each file against its nearest
 * `tsconfig.json`, so a single run still type-checks every workspace with that
 * workspace's own compiler options. Keeping one config also means the
 * pre-commit hook can lint a mixed set of staged files in a single pass.
 *
 * Layer order matters. The workspace-scoped layers come first, then the test
 * relaxations, then `untypedFileOverrides` last, so that no earlier layer
 * re-enables a type-aware rule for a file the project service cannot type.
 */
export default tseslint.config(
  baseConfig(import.meta.dirname),
  {
    files: ['apps/api/**/*.ts', 'apps/mcp-server/**/*.ts'],
    extends: nestOverrides,
  },
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    extends: reactOverrides,
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: nextOverrides,
  },
  testFileOverrides,
  untypedFileOverrides,
);
