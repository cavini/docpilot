import { ApiProperty } from '@nestjs/swagger';

/** What the demo's spend ceiling looks like right now. */
export class AccessBudgetDto {
  /**
   * Whether the day's ceiling has been reached.
   *
   * True means answers come from the mock until it resets. It does not mean
   * the key was rejected - those are different problems, and conflating them
   * would have a reader rotating a key that works fine.
   */
  @ApiProperty({ example: false })
  spent: boolean;

  /** When the ceiling lifts. Null when no ceiling is configured. */
  @ApiProperty({ example: '2026-11-02T00:00:00.000Z', nullable: true, type: String })
  resetsAt: string | null;
}

/** Answer to `GET /access`. */
export class AccessResponseDto {
  /** Always true: a wrong key never reaches the handler. */
  @ApiProperty({ example: true })
  ok: boolean;

  /**
   * Whether a key is required at all.
   *
   * False locally, where the API is open. A client can use this to skip the
   * unlock form rather than showing one that accepts anything.
   */
  @ApiProperty({ example: true })
  keyRequired: boolean;

  @ApiProperty({ type: AccessBudgetDto })
  budget: AccessBudgetDto;
}
