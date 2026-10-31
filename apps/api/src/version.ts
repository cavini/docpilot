import { createRequire } from 'node:module';

/** Shape of the fields read from `package.json`. */
interface PackageManifest {
  version?: unknown;
}

/**
 * Resolver rooted at this file.
 *
 * `__filename` rather than `import.meta.url` because this package compiles to
 * CommonJS. If it ever moves to ESM the compiler will reject this line rather
 * than let it fail at runtime, which is the right way round.
 */
const resolve = createRequire(__filename);

/**
 * The application's version, as reported by `/health` and published in the
 * OpenAPI document.
 *
 * Read from `package.json` rather than written here, because a hardcoded
 * version is wrong from the first release onwards and nothing tells you.
 *
 * The manifest is resolved at runtime rather than imported, because a JSON
 * import is emitted into the compiled output and TypeScript then wants the
 * file inside `rootDir`. The relative path is the same either way: this
 * module sits one level under the package root in `src/` and one level under
 * it again in `dist/`.
 *
 * `DD_VERSION` overrides it, so a deployment can report the build it is
 * actually running — a container image tag, say — rather than whatever was in
 * the manifest when it was compiled.
 */
export const VERSION: string = (() => {
  if (process.env.DD_VERSION !== undefined && process.env.DD_VERSION !== '') {
    return process.env.DD_VERSION;
  }

  try {
    const manifest = resolve('../package.json') as PackageManifest;

    return typeof manifest.version === 'string' ? manifest.version : '0.0.0';
  } catch {
    // Only reachable if the manifest cannot be read at all, which would mean
    // something is badly wrong with the install.
    return '0.0.0';
  }
})();
