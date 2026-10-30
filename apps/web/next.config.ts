import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The design system is published as TypeScript source rather than a build
  // step, so Next compiles it along with the app.
  transpilePackages: ['@docpilot/ui'],
  typedRoutes: true,
};

export default withNextIntl(nextConfig);
