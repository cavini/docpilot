import { type ReactNode, useId, useState } from 'react';

import { Spinner } from '../spinner/spinner';
import { StatusBadge, type StatusTone } from '../status-badge/status-badge';

/** Where a tool call has got to. */
export type ToolStepStatus = 'running' | 'done' | 'failed' | 'awaiting-approval' | 'denied';

/** Props accepted by {@link ToolStep}. */
export interface ToolStepProps {
  /** The tool's name, as the model called it. */
  name: string;
  status: ToolStepStatus;
  /** Localised label for the status. */
  statusLabel: string;
  /** What the model passed in, already formatted. */
  input?: ReactNode;
  /** What came back, already formatted. Shown when expanded. */
  output?: ReactNode;
  /** Accessible label for the expand control. */
  toggleLabel: string;
  /** Label for the input section. */
  inputLabel: string;
  /** Label for the output section. */
  outputLabel: string;
  /** Shown instead of the output while approval is pending. */
  approval?: ReactNode;
}

const TONE: Record<ToolStepStatus, StatusTone> = {
  running: 'progress',
  done: 'ok',
  failed: 'danger',
  'awaiting-approval': 'warn',
  denied: 'neutral',
};

/**
 * One step of an agent's work.
 *
 * An agent whose work is invisible is impossible to trust or to debug, so
 * every call shows its name, its input and its result. Collapsed by default:
 * a tool's output is often hundreds of lines of retrieved passages, and a
 * transcript that dumps all of it buries the answer the reader came for.
 *
 * The toggle is a `<button>` with `aria-expanded` rather than a `<details>`
 * element, because the panel has to stay open while the content underneath it
 * changes — a `<details>` re-rendered mid-stream closes itself.
 *
 * @example
 * ```tsx
 * <ToolStep name="search_docs" status="done" statusLabel="Done" … />
 * ```
 */
export function ToolStep({
  name,
  status,
  statusLabel,
  input,
  output,
  toggleLabel,
  inputLabel,
  outputLabel,
  approval,
}: ToolStepProps): ReactNode {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const hasDetail = input !== undefined || output !== undefined;

  return (
    <div className="border-border bg-surface-muted/50 flex flex-col gap-2 rounded-lg border px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <code className="text-content text-xs font-medium">{name}</code>
        <StatusBadge tone={TONE[status]}>{statusLabel}</StatusBadge>
        {status === 'running' ? <Spinner label={statusLabel} /> : null}

        {hasDetail ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={toggleLabel}
            onClick={() => {
              setOpen((current) => !current);
            }}
            className="text-content-muted hover:text-content ml-auto text-xs"
          >
            <span aria-hidden="true">{open ? '−' : '+'}</span>
          </button>
        ) : null}
      </div>

      {approval === undefined ? null : approval}

      {hasDetail && open ? (
        <div id={panelId} className="flex flex-col gap-2">
          {input === undefined ? null : (
            <div className="flex flex-col gap-1">
              <p className="text-content-muted text-xs font-medium">{inputLabel}</p>
              <pre className="bg-surface border-border text-content overflow-x-auto rounded border p-2 text-xs">
                {input}
              </pre>
            </div>
          )}
          {output === undefined ? null : (
            <div className="flex flex-col gap-1">
              <p className="text-content-muted text-xs font-medium">{outputLabel}</p>
              <pre className="bg-surface border-border text-content max-h-64 overflow-auto rounded border p-2 text-xs">
                {output}
              </pre>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
