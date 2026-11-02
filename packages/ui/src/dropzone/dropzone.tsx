import { type DragEvent, type ReactNode, useCallback, useId, useRef, useState } from 'react';

/** Props accepted by {@link Dropzone}. */
export interface DropzoneProps {
  /** Called with the dropped or chosen files. Never called with an empty list. */
  onFiles: (files: File[]) => void;
  /** `accept` for the underlying input, such as `.pdf,.md,.txt`. */
  accept?: string;
  /** Instruction shown in the resting state. */
  label: ReactNode;
  /** Secondary line, usually the accepted types and the size limit. */
  hint?: ReactNode;
  /** Accessible name for the file input. */
  inputLabel: string;
  /** Blocks interaction while an upload is in flight. */
  disabled?: boolean;
  /**
   * Tightens the padding and the type for a narrow column.
   *
   * The resting size is built for a full-width page. In a sidebar rail the
   * same box is taller than three documents, which inverts what the rail is
   * for.
   */
  compact?: boolean;
}

/**
 * A drag-and-drop file target that is also a real file input.
 *
 * The visible region is a `<label>` wrapping a real `<input type="file">`,
 * which is what makes it work without a mouse: the input is focusable and
 * activates with Enter, so the keyboard path is the browser's own rather than
 * a `tabIndex` and `onKeyDown` reimplementation that has to be kept correct.
 * The input is visually hidden but not `display: none`, because a hidden input
 * is removed from the tab order entirely.
 *
 * Drag state is tracked with a counter rather than a boolean. `dragleave`
 * fires every time the pointer crosses into a child element, so a boolean
 * flickers off while the pointer is still inside the zone.
 *
 * @example
 * ```tsx
 * <Dropzone onFiles={upload} accept=".pdf,.md" label="Drop a document" inputLabel="Choose a file" />
 * ```
 */
export function Dropzone({
  onFiles,
  accept,
  label,
  hint,
  inputLabel,
  disabled = false,
  compact = false,
}: DropzoneProps): ReactNode {
  const inputId = useId();
  const depth = useRef(0);
  const [over, setOver] = useState(false);

  const emit = useCallback(
    (files: FileList | null): void => {
      const list = Array.from(files ?? []);

      if (list.length > 0) {
        onFiles(list);
      }
    },
    [onFiles],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLLabelElement>): void => {
      event.preventDefault();
      depth.current = 0;
      setOver(false);

      if (!disabled) {
        emit(event.dataTransfer.files);
      }
    },
    [disabled, emit],
  );

  const onDragOver = useCallback((event: DragEvent<HTMLLabelElement>): void => {
    // Without this the browser navigates to the dropped file.
    event.preventDefault();
  }, []);

  const onDragEnter = useCallback((): void => {
    depth.current += 1;
    setOver(true);
  }, []);

  const onDragLeave = useCallback((): void => {
    depth.current -= 1;

    if (depth.current <= 0) {
      depth.current = 0;
      setOver(false);
    }
  }, []);

  return (
    <label
      htmlFor={inputId}
      data-over={over ? 'true' : undefined}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed text-center transition-colors ${
        compact ? 'px-3 py-4' : 'px-6 py-8'
      } ${
        over ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <span className={`text-content font-medium ${compact ? 'text-sm' : ''}`}>{label}</span>
      {hint === undefined ? null : (
        <span className={`text-content-muted ${compact ? 'text-xs' : 'text-sm'}`}>{hint}</span>
      )}
      <input
        id={inputId}
        type="file"
        multiple
        accept={accept}
        aria-label={inputLabel}
        disabled={disabled}
        // Visually hidden but still in the tab order, unlike `display: none`.
        className="sr-only"
        onChange={(event) => {
          emit(event.target.files);
          // Reset so choosing the same file twice fires change twice.
          event.target.value = '';
        }}
      />
    </label>
  );
}
