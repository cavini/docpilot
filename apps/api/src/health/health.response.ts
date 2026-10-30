import { ApiProperty } from '@nestjs/swagger';

/** Health of one dependency. */
export class DependencyHealthResponse {
  /** Whether the dependency answered. */
  @ApiProperty({ enum: ['ok', 'degraded', 'down'], example: 'ok' })
  status: 'ok' | 'degraded' | 'down';

  /** Round trip time of the probe, absent when the probe did not complete. */
  @ApiProperty({ required: false, example: 3 })
  latencyMs?: number;

  /** Why the probe failed. Never contains credentials. */
  @ApiProperty({ required: false, example: 'connection refused' })
  error?: string;
}

/** Every external system the API needs in order to serve requests. */
export class HealthDependenciesResponse {
  @ApiProperty({ type: DependencyHealthResponse })
  database: DependencyHealthResponse;

  @ApiProperty({ type: DependencyHealthResponse })
  redis: DependencyHealthResponse;

  @ApiProperty({ type: DependencyHealthResponse })
  storage: DependencyHealthResponse;
}

/**
 * Body of `GET /health`.
 *
 * Mirrors `healthResponseSchema` in `@docpilot/shared`. The Zod schema is the
 * contract that the web app and the contract tests validate against; this
 * class exists so `@nestjs/swagger` can describe the same shape in
 * `openapi.json`, and a contract test fails if the two ever drift.
 */
export class HealthResponseDto {
  /** Worst status across every dependency. */
  @ApiProperty({ enum: ['ok', 'degraded', 'down'], example: 'ok' })
  status: 'ok' | 'degraded' | 'down';

  /** Application version. */
  @ApiProperty({ example: '0.1.0' })
  version: string;

  /** Seconds since the process started. */
  @ApiProperty({ example: 1284 })
  uptimeSeconds: number;

  /** When the probes ran. */
  @ApiProperty({ example: '2026-10-30T12:00:00.000Z' })
  checkedAt: string;

  @ApiProperty({ type: HealthDependenciesResponse })
  dependencies: HealthDependenciesResponse;
}
