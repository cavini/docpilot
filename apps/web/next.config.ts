import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

// Next reads .env from this app's directory, but the project keeps one .env at
// the repository root so that the API and the web app are configured in one
// place. Loading it here, before Next inlines the NEXT_PUBLIC_ variables, lets
// the root file reach the browser bundle. Node gives precedence to variables
// already in the environment, so a deployment's own configuration still wins.
const rootEnv = resolve(import.meta.dirname, '../../.env');

if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The design system is published as TypeScript source rather than a build
  // step, so Next compiles it along with the app.
  transpilePackages: ['@docpilot/ui'],
  typedRoutes: true,
};

export default withNextIntl(nextConfig);
