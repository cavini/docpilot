import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

/** Minimal shape of the parts of an OpenAPI document used here. */
interface OpenApiDocument {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, unknown> };
}

interface OpenApiOperation {
  responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
}

/** The committed spec, which is the contract clients are generated from. */
export const openApiDocument = JSON.parse(
  readFileSync(resolve(process.cwd(), 'openapi.json'), 'utf8'),
) as OpenApiDocument;

/**
 * `jest-openapi` has not been published since 2022, so response validation is
 * done directly with Ajv, which is actively maintained and is what generated
 * clients validate against anyway.
 *
 * `strict: false` because OpenAPI's schema dialect carries keywords such as
 * `example` and `nullable` that Ajv does not know; rejecting them would mean
 * stripping the spec before validating it, which would stop testing the thing
 * that is actually published.
 */
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

// Component schemas are registered so `$ref` in a response resolves.
for (const [name, schema] of Object.entries(openApiDocument.components?.schemas ?? {})) {
  ajv.addSchema(schema as object, `#/components/schemas/${name}`);
}

/**
 * Builds a validator for one endpoint's response.
 *
 * @param path OpenAPI path, such as `/health`.
 * @param method HTTP method, lowercase.
 * @param status Status code as a string, such as `'200'`.
 * @returns A validator for that response's JSON body.
 * @throws If the spec describes no such response, which is itself a contract
 *   failure: the endpoint exists but is undocumented.
 *
 * @example
 * ```ts
 * const validate = responseValidator('/health', 'get', '200');
 * expect(validate(body)).toBe(true);
 * ```
 */
export function responseValidator(path: string, method: string, status: string): ValidateFunction {
  const schema =
    openApiDocument.paths[path]?.[method]?.responses?.[status]?.content?.['application/json']
      ?.schema;

  if (!schema) {
    throw new Error(
      `openapi.json describes no ${method.toUpperCase()} ${path} ${status} JSON response. ` +
        'Run `pnpm openapi:export` after changing the API.',
    );
  }

  return ajv.compile(schema);
}

/** Formats Ajv's errors into something readable in a test failure. */
export function describeErrors(validate: ValidateFunction): string {
  return (validate.errors ?? [])
    .map((error) => `${error.instancePath || '<root>'} ${error.message ?? ''}`)
    .join('; ');
}
