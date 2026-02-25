/** Core schema object types */

export interface ColumnInfo {
  schema: string;
  tableName: string;
  name: string;
  position: number;
  datatype: string;
  datatypeString: string;
  notNull: boolean;
  default: string | null;
  isEnum: boolean;
  enumName: string | null;
  enumSchema: string | null;
  isIdentity: boolean;
  isIdentityAlways: boolean;
  isGenerated: boolean;
  collation: string | null;
}

export interface TableInfo {
  schema: string;
  name: string;
  columns: Map<string, ColumnInfo>;
  relationtype: string; // 'r' = table, 'v' = view, 'm' = materialized view, 'p' = partitioned
  definition: string | null; // view definition
  parentTable: string | null;
  partitionDef: string | null;
  rowSecurity: boolean;
  forceRowSecurity: boolean;
  persistence: string;
  comment: string | null;
}

export interface IndexInfo {
  schema: string;
  tableName: string;
  name: string;
  definition: string;
  isUnique: boolean;
  isPk: boolean;
  algorithm: string;
  keyColumns: string[];
  includedColumns: string[];
  partialPredicate: string | null;
}

export interface ConstraintInfo {
  schema: string;
  name: string;
  tableName: string;
  definition: string;
  constraintType: string; // CHECK, FOREIGN KEY, PRIMARY KEY, UNIQUE, EXCLUDE
  isDeferrable: boolean;
  initiallyDeferred: boolean;
  // FK specific
  foreignTableSchema: string | null;
  foreignTableName: string | null;
  fkColumnsLocal: string[] | null;
  fkColumnsForeign: string[] | null;
}

export interface EnumInfo {
  schema: string;
  name: string;
  elements: string[];
}

export interface SequenceInfo {
  schema: string;
  name: string;
  tableName: string | null;
  columnName: string | null;
  isIdentity: boolean;
}

export interface FunctionInfo {
  schema: string;
  name: string;
  identityArguments: string;
  returntype: string;
  definition: string | null;
  fullDefinition: string;
  language: string;
  strictness: string;
  securityType: string;
  volatility: string;
  kind: string; // 'f' = function, 'p' = procedure
  resultString: string;
  comment: string | null;
}

export interface TriggerInfo {
  schema: string;
  name: string;
  tableName: string;
  fullDefinition: string;
  procName: string;
  procSchema: string;
  enabled: string;
}

export interface ExtensionInfo {
  schema: string;
  name: string;
  version: string;
}

export interface PrivilegeInfo {
  schema: string;
  name: string;
  objectType: string;
  user: string;
  privilege: string;
}

export interface RLSPolicyInfo {
  schema: string;
  name: string;
  tableName: string;
  commandType: string;
  permissive: boolean;
  roles: string[];
  qual: string | null;
  withCheck: string | null;
}

export interface SchemaObjects {
  tables: Map<string, TableInfo>;
  views: Map<string, TableInfo>;
  materializedViews: Map<string, TableInfo>;
  selectables: Map<string, TableInfo>; // all of the above
  indexes: Map<string, IndexInfo>;
  constraints: Map<string, ConstraintInfo>;
  enums: Map<string, EnumInfo>;
  sequences: Map<string, SequenceInfo>;
  functions: Map<string, FunctionInfo>;
  triggers: Map<string, TriggerInfo>;
  extensions: Map<string, ExtensionInfo>;
  schemas: Set<string>;
  privileges: Map<string, PrivilegeInfo>;
  rlsPolicies: Map<string, RLSPolicyInfo>;
}

export interface DiffResult {
  sql: string;
  statements: string[];
  summary: {
    added: string[];
    removed: string[];
    modified: string[];
  };
}

export interface DiffOptions {
  safe?: boolean; // refuse to generate DROP statements
  schema?: string; // only diff specific schema
  ignoreExtensionVersions?: boolean;
}
