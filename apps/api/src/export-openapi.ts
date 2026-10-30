import 'reflect-metadata';

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { buildOpenApiDocument } from './swagger.js';

/**
 * Where the exported spec is written. The npm script runs from the app root,
 * so this resolves to `apps/api/openapi.json`.
 */
const OUTPUT_PATH = resolve(process.cwd(), 'openapi.json');

/**
 * Writes `openapi.json` from the running application's own route metadata.
 *
 * The spec is committed, and CI re-runs this and fails if the result differs,
 * which makes an undocumented endpoint or a changed response shape a build
 * failure rather than something a client discovers later. The typed clients
 * for the web app and the MCP server are generated from this file, so it is
 * the single contract all three share.
 *
 * The application graph is built but never listened on, and no provider opens
 * a connection until it is used, so this runs with no database, Redis or
 * storage available. That matters: it belongs in the cheap static stage of CI.
 */
async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();

  try {
    const document = buildOpenApiDocument(app);
    await writeFile(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  } finally {
    await app.close();
  }

  // eslint-disable-next-line no-console -- this is a CLI script, not application code
  console.log(`wrote ${OUTPUT_PATH}`);
}

void exportOpenApi();
