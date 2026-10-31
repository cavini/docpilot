import { type ButtonHTMLAttributes, forwardRef } from 'react';

/** Props accepted by {@link CitationChip}. */
export interface CitationChipProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'children'
> {
  /** The citation's number, as it appears in the answer. */
  n: number;
  /** Where it came from, for the accessible name — usually the document title. */
  source: string;
}

/**
 * The pressable `[n]` inside an answer.
 *
 * A real button, because it does something. Rendering it as styled text with
 * an `onClick` would make it invisible to a keyboard and unannounced to a
 * screen reader — and a citation nobody can reach is decoration, which is the
 * exact failure this component exists to prevent.
 *
 * The accessible name names the source rather than reading "1", because "1" on
 * its own tells a screen reader user nothing about what they are about to open.
 *
 * @example
 * ```tsx
 * <CitationChip n={1} source="Lumen API" onClick={() => open(1)} />
 * ```
 */
export const CitationChip = forwardRef<HTMLButtonElement, CitationChipProps>(function CitationChip(
  { n, source, ...rest },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      aria-label={`Source ${String(n)}: ${source}`}
      className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded border border-accent/30 bg-accent/10 px-1 align-baseline text-xs font-medium text-accent tabular-nums hover:bg-accent/20"
    >
      {n}
    </button>
  );
});
