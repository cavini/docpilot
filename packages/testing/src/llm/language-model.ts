import { type LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import { MockLanguageModelV4 } from 'ai/test';

/** How the scripted model should respond to a call. */
export interface ScriptedResponse {
  /** Text the model returns. */
  text: string;
  /** Tokens to report as consumed. */
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * A language model that returns exactly what a test tells it to.
 *
 * The point is not to imitate a model. It is to make everything *around* the
 * model testable: whether an invalid citation is stripped, whether a refusal
 * is passed through unchanged, whether usage is recorded. Those are the parts
 * that can be wrong in a way a real model would hide behind its own
 * variability.
 *
 * Responses are consumed in order. The last one repeats once the script runs
 * out, so a test that makes an unexpected extra call gets a sensible answer
 * rather than an inscrutable undefined.
 *
 * @param responses What to return, in order.
 * @returns A mock model, with `doGenerateCalls` recording what it was asked.
 *
 * @example
 * ```ts
 * const model = createScriptedLanguageModel([
 *   { text: 'Tokens last an hour [1].' },
 * ]);
 * ```
 */
export function createScriptedLanguageModel(responses: ScriptedResponse[]): MockLanguageModelV4 {
  let index = 0;

  return new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'mock-chat',
    doGenerate: (): Promise<LanguageModelV4GenerateResult> => {
      const response = responses[Math.min(index, responses.length - 1)] ?? { text: '' };
      index += 1;

      const inputTokens = response.inputTokens ?? 100;
      const outputTokens = response.outputTokens ?? 20;

      return Promise.resolve({
        content: response.text === '' ? [] : [{ type: 'text', text: response.text }],
        // V4 reports a structured finish reason and a structured usage
        // breakdown rather than a bare string and three numbers.
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: {
            total: inputTokens,
            noCache: inputTokens,
            cacheRead: 0,
            cacheWrite: 0,
          },
          outputTokens: { total: outputTokens, text: outputTokens, reasoning: 0 },
        },
        warnings: [],
      });
    },
  });
}
