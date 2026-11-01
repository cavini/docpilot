/**
 * How a field renders in a table.
 *
 * Deliberately a small closed set rather than the Zod type: the client needs
 * to know how wide a column should be and whether to right-align it, not
 * whether the value passed a refinement. Anything the table cannot lay out
 * specially is `string`.
 */
export type FieldKind = 'string' | 'text' | 'enum' | 'boolean' | 'number';

/** One column of an extraction result. */
export interface SchemaField {
  /** Key on the extracted item. */
  name: string;
  kind: FieldKind;
  /** Column heading, in English. The client translates by `name`. */
  label: string;
  /** Allowed values, for an enum. */
  options?: readonly string[];
}
