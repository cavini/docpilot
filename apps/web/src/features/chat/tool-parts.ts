import { type ToolStepStatus } from '@docpilot/ui';
import { type UIMessage } from 'ai';

/** A tool call, reduced to what the interface renders. */
export interface ToolCallView {
  /** Identifies the call, and keys the rendered step. */
  toolCallId: string;
  /** The tool's name, without the `tool-` prefix the SDK adds. */
  name: string;
  status: ToolStepStatus;
  /** What the model passed in, pretty-printed. Undefined while it streams. */
  input?: string;
  /** What came back, pretty-printed, or the error text. */
  output?: string;
  /** Present only while the reader has yet to answer. */
  approvalId?: string;
}

/** The SDK's tool part states, mapped to what the step shows. */
const STATUS: Record<string, ToolStepStatus> = {
  'input-streaming': 'running',
  'input-available': 'running',
  'approval-requested': 'awaiting-approval',
  'approval-responded': 'running',
  'output-available': 'done',
  'output-error': 'failed',
  'output-denied': 'denied',
};

/** Pretty-prints a value for a tool step, or returns undefined for nothing. */
function format(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

/**
 * Reads the tool calls out of a message.
 *
 * The SDK names a tool part `tool-<name>`, with `dynamic-tool` for one whose
 * schema was not known ahead of time. Both are rendered the same way — the
 * reader cares which tool ran, not how it was declared.
 *
 * A tool whose output is a structured failure renders as **failed** even
 * though the SDK reports it as `output-available`: the tools return their
 * errors as data so the model can act on them, and the interface should not
 * repeat the model's job of noticing.
 *
 * @param message The assistant message to read.
 * @returns The tool calls it carries, in the order they were made.
 *
 * @example
 * ```ts
 * const steps = toolCallsOf(message);
 * ```
 */
export function toolCallsOf(message: UIMessage): ToolCallView[] {
  const calls: ToolCallView[] = [];

  for (const part of message.parts) {
    if (!part.type.startsWith('tool-') && part.type !== 'dynamic-tool') {
      continue;
    }

    const tool = part as unknown as {
      type: string;
      toolName?: string;
      toolCallId: string;
      state: string;
      input?: unknown;
      output?: unknown;
      errorText?: string;
      approval?: { id: string };
    };

    const failure =
      tool.state === 'output-available' &&
      typeof tool.output === 'object' &&
      tool.output !== null &&
      (tool.output as { ok?: unknown }).ok === false;

    const input = format(tool.input);
    const output = tool.errorText ?? format(tool.output);
    const approvalId = tool.state === 'approval-requested' ? tool.approval?.id : undefined;

    const call: ToolCallView = {
      toolCallId: tool.toolCallId,
      name: tool.toolName ?? tool.type.replace(/^tool-/u, ''),
      status: failure ? 'failed' : (STATUS[tool.state] ?? 'running'),
    };

    if (input !== undefined) {
      call.input = input;
    }

    if (output !== undefined) {
      call.output = output;
    }

    if (approvalId !== undefined) {
      call.approvalId = approvalId;
    }

    calls.push(call);
  }

  return calls;
}

/** A ticket the agent has proposed but not created. */
export interface ProposedTicket {
  title: string;
  body: string;
  labels: string[];
}

/**
 * Reads a proposed ticket out of a pending tool call's input.
 *
 * Returns null rather than throwing on anything unexpected. The input comes
 * from a model, so "it is not the shape we hoped" is a normal outcome — and
 * the reader is about to be asked to approve it, so showing a blank where the
 * title should be is worse than showing nothing at all.
 *
 * @param call The pending tool call.
 * @returns The proposal, or null if the input does not describe one.
 */
export function proposedTicketOf(call: ToolCallView): ProposedTicket | null {
  if (call.input === undefined) {
    return null;
  }

  try {
    const parsed = JSON.parse(call.input) as Record<string, unknown>;
    const { title, body, labels } = parsed;

    if (typeof title !== 'string' || typeof body !== 'string') {
      return null;
    }

    return {
      title,
      body,
      labels: Array.isArray(labels) ? labels.filter((label) => typeof label === 'string') : [],
    };
  } catch {
    return null;
  }
}
