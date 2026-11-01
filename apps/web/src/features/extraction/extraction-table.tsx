'use client';

import { type SchemaField } from '@docpilot/shared';
import { EmptyState, StatusBadge } from '@docpilot/ui';
import { useTranslations } from 'next-intl';
import { type ReactNode } from 'react';

/** Props accepted by {@link ExtractionTable}. */
export interface ExtractionTableProps {
  /** Columns, from the schema the server published. */
  fields: SchemaField[];
  /** Rows that have arrived so far. */
  items: Record<string, unknown>[];
  /** True while more are still coming. */
  streaming: boolean;
}

/**
 * Renders a value the model produced.
 *
 * `String()` is not safe here: the value comes from a model, and a field the
 * schema says is a string can arrive as an object. `[object Object]` in a
 * cell is a rendering bug wearing a value's clothes, so anything that is not
 * a primitive is shown as JSON instead.
 */
function asText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}

/** Renders one cell, by the kind of field it is. */
function Cell({ field, value }: { field: SchemaField; value: unknown }): ReactNode {
  if (value === undefined || value === null) {
    // A field the model did not fill. An em dash rather than an empty cell,
    // so a gap is visibly a gap rather than a rendering fault.
    return <span className="text-content-muted">—</span>;
  }

  if (field.kind === 'boolean') {
    return <StatusBadge tone={value === true ? 'ok' : 'neutral'}>{asText(value)}</StatusBadge>;
  }

  if (field.kind === 'enum') {
    return <code className="text-xs">{asText(value)}</code>;
  }

  if (field.kind === 'number') {
    return <span className="tabular-nums">{asText(value)}</span>;
  }

  return <span className={field.kind === 'text' ? '' : 'font-mono text-xs'}>{asText(value)}</span>;
}

/**
 * The extracted items, as a table that fills as they arrive.
 *
 * Columns come from the schema the server published rather than from anything
 * here, so adding a schema needs no change to this component.
 *
 * Rows are keyed by position, which is safe precisely because rows are only
 * ever appended — the server sends completed items and nothing reorders or
 * replaces them.
 *
 * The table scrolls inside its own container. A wide schema would otherwise
 * make the whole page scroll sideways, which is the one layout failure that
 * makes everything else unusable.
 */
export function ExtractionTable({ fields, items, streaming }: ExtractionTableProps): ReactNode {
  const t = useTranslations('extraction');

  if (items.length === 0) {
    return streaming ? (
      <p className="text-content-muted text-sm">{t('waiting')}</p>
    ) : (
      <EmptyState title={t('empty.title')} description={t('empty.description')} />
    );
  }

  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{t('tableCaption', { count: items.length })}</caption>
        <thead className="bg-surface-muted text-content-muted">
          <tr>
            {fields.map((field) => (
              <th key={field.name} scope="col" className="px-3 py-2 text-xs font-medium">
                {t.has(`field.${field.name}`) ? t(`field.${field.name}`) : field.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, at) => (
            <tr key={at} className="border-border border-t align-top">
              {fields.map((field) => (
                <td key={field.name} className="px-3 py-2">
                  <Cell field={field} value={item[field.name]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
