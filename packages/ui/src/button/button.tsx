import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react';

/** How much visual weight a button carries. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

/** Button size. */
export type ButtonSize = 'sm' | 'md';

/** Props accepted by {@link Button}. */
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  /** Visual weight. Defaults to `primary`. */
  variant?: ButtonVariant;
  /** Size. Defaults to `md`. */
  size?: ButtonSize;
  /**
   * Shows a busy state and blocks interaction.
   *
   * Prefer this over setting `disabled` while waiting: a disabled button is
   * removed from the tab order, so a keyboard user loses their place. This
   * keeps the button focusable and announces the busy state instead.
   */
  loading?: boolean;
  /** Button label. */
  children: ReactNode;
}

const BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-medium transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-50 aria-busy:cursor-progress';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast hover:opacity-90',
  secondary: 'bg-surface-muted text-content border border-border hover:bg-surface',
  ghost: 'text-content hover:bg-surface-muted',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

/**
 * The application's button.
 *
 * A real `<button>` rather than a styled `div`, so it is focusable, activates
 * on both Enter and Space, and is announced as a button without any extra
 * attributes.
 *
 * @example
 * ```tsx
 * <Button variant="primary" onClick={send}>Send</Button>
 * <Button loading>Uploading</Button>
 * ```
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      // `aria-busy` announces the wait. `aria-disabled` says "not actionable
      // right now" while keeping the button in the tab order, which the native
      // `disabled` attribute would not. A natively disabled button already
      // conveys both, so these apply to the loading state only.
      aria-busy={loading ? true : undefined}
      aria-disabled={loading ? true : undefined}
      className={`${BASE} ${VARIANT[variant]} ${SIZE[size]}`}
      onClick={loading ? undefined : rest.onClick}
    >
      {children}
    </button>
  );
});
