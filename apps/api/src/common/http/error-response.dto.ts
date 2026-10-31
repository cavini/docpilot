import { ApiProperty } from '@nestjs/swagger';

/** Body of a failed response. */
export class ErrorBodyDto {
  /**
   * Stable machine-readable identifier for the failure. Branch on this rather
   * than on the message, which may be reworded.
   */
  @ApiProperty({ example: 'not_found' })
  code: string;

  /** Human-readable explanation. Never contains credentials. */
  @ApiProperty({ example: 'document 7f3a was not found' })
  message: string;

  /**
   * Identifier of the request that failed. Quote it in a bug report: it
   * appears on every log line for the request.
   */
  @ApiProperty({ example: '6f6cf7c5-d7c3-4281-8c89-c67912abade4' })
  requestId: string;

  /** Extra context, present only when it helps the caller act. */
  @ApiProperty({ required: false, type: Object, additionalProperties: true })
  details?: Record<string, unknown>;
}

/**
 * Every failed response from the API has this shape, whatever went wrong, so a
 * client needs one error path rather than one per endpoint.
 */
export class ErrorResponseDto {
  @ApiProperty({ type: ErrorBodyDto })
  error: ErrorBodyDto;
}
