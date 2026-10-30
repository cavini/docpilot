import { Injectable } from '@nestjs/common';
import { type Tiktoken, getEncoding } from 'js-tiktoken';

/**
 * Counts tokens the way a model does.
 *
 * Chunk sizes are stated in tokens because that is the unit models charge and
 * limit by. Counting characters instead drifts badly: `autenticação` is twelve
 * characters and five tokens, while a run of punctuation can be one character
 * per token.
 *
 * `o200k_base` is the encoding of the current generation of models. Different
 * models tokenise slightly differently, so this is an estimate for any
 * specific one — but the figure is used to decide where to split, not to
 * predict a bill, and the error is a few percent.
 *
 * The encoding table is loaded once on first use, not in the constructor,
 * because it takes a few hundred milliseconds and nothing should pay for it
 * during startup or while exporting the OpenAPI spec.
 */
@Injectable()
export class TokenizerService {
  private encoding: Tiktoken | undefined;

  /**
   * Counts the tokens in a string.
   *
   * @param text Text to measure.
   * @returns Number of tokens.
   *
   * @example
   * ```ts
   * tokenizer.count('autenticação'); // 5
   * ```
   */
  count(text: string): number {
    this.encoding ??= getEncoding('o200k_base');

    return this.encoding.encode(text).length;
  }

  /** The counter as a plain function, for code that takes one. */
  get counter(): (text: string) => number {
    return (text: string) => this.count(text);
  }
}
