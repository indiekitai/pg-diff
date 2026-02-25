/**
 * @indiekit/pg-diff - PostgreSQL schema diff
 * Compares two PostgreSQL databases and generates migration SQL.
 */
export { inspectSchema } from './inspect.js';
export { computeDiff } from './differ.js';
export type {
  DiffResult,
  DiffOptions,
  SchemaObjects,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  ConstraintInfo,
  EnumInfo,
  SequenceInfo,
  FunctionInfo,
  TriggerInfo,
  ExtensionInfo,
  PrivilegeInfo,
  RLSPolicyInfo,
} from './types.js';

import { inspectSchema } from './inspect.js';
import { computeDiff } from './differ.js';
import type { DiffResult, DiffOptions } from './types.js';

/**
 * Compare two PostgreSQL databases and generate migration SQL.
 * @param fromUrl - Connection string for the source database
 * @param toUrl - Connection string for the target database
 * @param options - Diff options
 * @returns Migration SQL and metadata
 */
export async function diff(
  fromUrl: string,
  toUrl: string,
  options: DiffOptions = {},
): Promise<DiffResult> {
  const [fromSchema, toSchema] = await Promise.all([
    inspectSchema(fromUrl),
    inspectSchema(toUrl),
  ]);

  return computeDiff(fromSchema, toSchema, options);
}
