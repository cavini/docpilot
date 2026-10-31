/*
 * Public surface of the design system.
 *
 * Imports are extensionless on purpose. This package is compiled with
 * `moduleResolution: "bundler"` and is consumed as **source**, not as a build
 * output, so the consumer's bundler resolves these paths. Writing them with
 * `.js` — correct under Node's ESM resolution — makes TypeScript happy and
 * then fails in Next, which looks for a file that does not exist because the
 * source is `.tsx`.
 */
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './button/button';
export { CitationChip, type CitationChipProps } from './citation-chip/citation-chip';
export { Dropzone, type DropzoneProps } from './dropzone/dropzone';
export { EmptyState, type EmptyStateProps } from './empty-state/empty-state';
export {
  MessageBubble,
  type MessageAuthor,
  type MessageBubbleProps,
} from './message-bubble/message-bubble';
export { SidePanel, type SidePanelProps } from './panel/side-panel';
export { Progress, type ProgressProps } from './progress/progress';
export { Spinner, type SpinnerProps } from './spinner/spinner';
export { StatusBadge, type StatusBadgeProps, type StatusTone } from './status-badge/status-badge';
