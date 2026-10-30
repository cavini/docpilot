/**
 * Stylesheets imported for their side effects.
 *
 * Vite resolves these at bundle time, but TypeScript 6 refuses a side-effect
 * import of a module it has no declaration for. The application gets the same
 * declaration from Next's generated types, which this folder's tsconfig does
 * not include, because it narrows `types` to keep Cypress's globals out of the
 * application.
 */
declare module '*.css';
declare module '@docpilot/ui/styles';
