/**
 * Side-effect imports of stylesheets.
 *
 * Vite resolves these at build time, but TypeScript 6 refuses a side-effect
 * import of a file it has no declaration for (TS2882), so the pattern is
 * declared here. Next supplies the same declaration for the web app through
 * its own generated types.
 */
declare module '*.css';
