import {
  type LanguageModelV4GenerateResult,
  type LanguageModelV4StreamPart,
  type LanguageModelV4StreamResult,
} from '@ai-sdk/provider';
import { MockLanguageModelV4 } from 'ai/test';

/** How the scripted model should respond to a call. */
export interface ScriptedResponse {
  /** Text the model returns. */
  text: string;
  /** Tokens to report as consumed. */
  inputTokens?: number;
  outputTokens?: number;
  /**
   * How to break the text up when streaming.
   *
   * Defaults to one chunk per word, which is roughly how a real model arrives
   * and is enough to prove the client is rendering progressively rather than
   * waiting for the whole answer. A test asserting "more than one chunk"
   * against a single-chunk mock would pass vacuously.
   */
  chunks?: string[];
  /**
   * Fails the stream after this many chunks.
   *
   * There is no way to ask a real provider to break mid-answer, so a test for
   * the partial-answer path needs a model that can be told to.
   */
  failAfter?: number;
  /**
   * A tool call to make instead of answering.
   *
   * The only way to test an agent loop deterministically. A real model decides
   * for itself whether to call a tool, which is exactly what a test asserting
   * "the step limit stops it" cannot depend on: scripting the call makes the
   * loop's behaviour the thing under test rather than the model's mood.
   */
  toolCall?: { toolName: string; input: unknown };
}

/** A scripted response that calls a tool rather than answering. */
export interface ScriptedToolCall {
  toolName: string;
  input: unknown;
}

/** Splits text the way a model tends to emit it: a word at a time. */
function defaultChunks(text: string): string[] {
  return text.length === 0 ? [] : text.split(/(?<=\s)/u);
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
        content:
          response.toolCall === undefined
            ? response.text === ''
              ? []
              : [{ type: 'text', text: response.text }]
            : [
                {
                  type: 'tool-call',
                  toolCallId: `call-${String(index)}`,
                  toolName: response.toolCall.toolName,
                  input: JSON.stringify(response.toolCall.input),
                },
              ],
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

    /**
     * Streams the scripted text in pieces.
     *
     * Emitted as the V4 provider protocol does it: `text-start`, a run of
     * `text-delta`, `text-end`, then `finish` with the usage. The SDK turns
     * that into the UI message stream the client consumes, so a test that
     * exercises this path exercises the same code production does.
     */
    doStream: (): Promise<LanguageModelV4StreamResult> => {
      const response = responses[Math.min(index, responses.length - 1)] ?? { text: '' };
      index += 1;

      const inputTokens = response.inputTokens ?? 100;
      const outputTokens = response.outputTokens ?? 20;
      const pieces = response.chunks ?? defaultChunks(response.text);
      const id = 'scripted-text';

      const stream = new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });

          if (response.toolCall !== undefined) {
            const callId = `call-${String(index)}`;
            const serialised = JSON.stringify(response.toolCall.input);

            controller.enqueue({
              type: 'tool-input-start',
              id: callId,
              toolName: response.toolCall.toolName,
            });
            controller.enqueue({ type: 'tool-input-delta', id: callId, delta: serialised });
            controller.enqueue({ type: 'tool-input-end', id: callId });
            controller.enqueue({
              type: 'tool-call',
              toolCallId: callId,
              toolName: response.toolCall.toolName,
              input: serialised,
            });
            controller.enqueue({
              type: 'finish',
              // 'tool-calls' is what tells the loop to run the tool and come
              // back for another step.
              finishReason: { unified: 'tool-calls', raw: undefined },
              usage: {
                inputTokens: {
                  total: inputTokens,
                  noCache: inputTokens,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: outputTokens, text: outputTokens, reasoning: 0 },
              },
            });
            controller.close();

            return;
          }

          controller.enqueue({ type: 'text-start', id });

          for (const [at, delta] of pieces.entries()) {
            if (response.failAfter !== undefined && at >= response.failAfter) {
              controller.enqueue({
                type: 'error',
                error: new Error('the scripted model was told to fail here'),
              });
              controller.close();

              return;
            }

            controller.enqueue({ type: 'text-delta', id, delta });
          }

          controller.enqueue({ type: 'text-end', id });
          controller.enqueue({
            type: 'finish',
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
          });
          controller.close();
        },
      });

      return Promise.resolve({ stream });
    },
  });
}
