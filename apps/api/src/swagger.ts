import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

import { VERSION } from './version.js';

/** Path Swagger UI is served from. */
export const SWAGGER_PATH = 'docs';

/**
 * Builds the OpenAPI description of the API.
 *
 * Kept separate from the entrypoint so the export script can produce
 * `openapi.json` from the same definition the running server serves, rather
 * than from a second copy that could drift. The committed spec is what the
 * typed clients and the contract tests are generated from, so one source
 * matters.
 *
 * @param app Nest application to describe.
 * @returns The OpenAPI document.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('DocPilot API')
    .setDescription(
      [
        'Answers questions about uploaded documents with citations back to the',
        'exact source chunk, and acts on them through tools.',
        '',
        'Responses that fail carry the shape `{ error: { code, message, requestId } }`.',
        'Branch on `code`, which is stable, rather than on `message`.',
      ].join('\n'),
    )
    .setVersion(VERSION)
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer('http://localhost:3001', 'Local development')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'demoApiKey')
    .addTag('health', 'Liveness and dependency status')
    .addTag('feature-flags', 'Which capabilities are enabled')
    .build();

  return SwaggerModule.createDocument(app, config);
}

/**
 * Serves Swagger UI and the raw document.
 *
 * @param app Nest application to mount the UI on.
 */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(SWAGGER_PATH, app, buildOpenApiDocument(app), {
    jsonDocumentUrl: `${SWAGGER_PATH}/json`,
    swaggerOptions: { persistAuthorization: true },
  });
}
