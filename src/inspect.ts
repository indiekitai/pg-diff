/**
 * Schema inspection - queries PostgreSQL catalog tables to extract schema info.
 * Simplified self-contained port of schemainspect.
 */
import pg from 'pg';
import type {
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

const SKIP_SCHEMAS = `
  AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  AND n.nspname NOT LIKE 'pg_temp_%'
  AND n.nspname NOT LIKE 'pg_toast_temp_%'
`;

function skipInternal(alias: string = 'n') {
  return `
    AND ${alias}.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    AND ${alias}.nspname NOT LIKE 'pg_temp_%'
    AND ${alias}.nspname NOT LIKE 'pg_toast_temp_%'
  `;
}

export async function inspectSchema(connectionString: string): Promise<SchemaObjects> {
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const [
      relations,
      indexes,
      constraints,
      enums,
      sequences,
      functions,
      triggers,
      extensions,
      schemas,
      privileges,
      rlsPolicies,
    ] = await Promise.all([
      queryRelations(client),
      queryIndexes(client),
      queryConstraints(client),
      queryEnums(client),
      querySequences(client),
      queryFunctions(client),
      queryTriggers(client),
      queryExtensions(client),
      querySchemas(client),
      queryPrivileges(client),
      queryRLSPolicies(client),
    ]);

    return {
      ...relations,
      indexes,
      constraints,
      enums,
      sequences,
      functions,
      triggers,
      extensions,
      schemas,
      privileges,
      rlsPolicies,
    };
  } finally {
    await client.end();
  }
}

async function queryRelations(client: pg.Client) {
  const sql = `
    WITH extension_oids AS (
      SELECT objid FROM pg_depend d
      WHERE d.refclassid = 'pg_extension'::regclass
        AND d.classid = 'pg_class'::regclass
    ),
    enums AS (
      SELECT t.oid AS enum_oid, n.nspname AS "schema", t.typname AS name
      FROM pg_catalog.pg_type t
      LEFT JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      LEFT OUTER JOIN extension_oids e ON t.oid = e.objid
      WHERE t.typcategory = 'E' AND e.objid IS NULL
        ${skipInternal()}
    )
    SELECT
      r.relationtype, r.schema, r.name, r.definition,
      a.attnum AS position_number, a.attname,
      a.attnotnull AS not_null,
      a.atttypid::regtype AS datatype,
      a.attidentity != '' AS is_identity,
      a.attidentity = 'a' AS is_identity_always,
      a.attgenerated != '' AS is_generated,
      pg_get_expr(ad.adbin, ad.adrelid) AS defaultdef,
      format_type(a.atttypid, a.atttypmod) AS datatypestring,
      e.enum_oid IS NOT NULL AS is_enum,
      e.name AS enum_name, e.schema AS enum_schema,
      pg_catalog.obj_description(r.oid) AS comment,
      r.parent_table, r.partition_def,
      r.rowsecurity, r.forcerowsecurity, r.persistence,
      (SELECT c2.collname FROM pg_catalog.pg_collation c2, pg_catalog.pg_type t2
       WHERE c2.oid = a.attcollation AND t2.oid = a.atttypid
       AND a.attcollation <> t2.typcollation) AS collation
    FROM (
      SELECT c.relname AS name, n.nspname AS schema, c.relkind AS relationtype,
        c.oid,
        CASE WHEN c.relkind IN ('m','v') THEN pg_get_viewdef(c.oid) ELSE NULL END AS definition,
        (SELECT '"' || nmsp_parent.nspname || '"."' || parent.relname || '"'
         FROM pg_inherits
         JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
         JOIN pg_namespace nmsp_parent ON nmsp_parent.oid = parent.relnamespace
         WHERE pg_inherits.inhrelid = c.oid) AS parent_table,
        CASE WHEN c.relpartbound IS NOT NULL THEN pg_get_expr(c.relpartbound, c.oid, true)
             WHEN c.relhassubclass THEN pg_catalog.pg_get_partkeydef(c.oid)
        END AS partition_def,
        c.relrowsecurity::boolean AS rowsecurity,
        c.relforcerowsecurity::boolean AS forcerowsecurity,
        c.relpersistence AS persistence
      FROM pg_catalog.pg_class c
      INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      LEFT OUTER JOIN extension_oids ext ON c.oid = ext.objid
      WHERE c.relkind IN ('r','v','m','c','p')
        AND ext.objid IS NULL
        ${skipInternal()}
    ) r
    LEFT JOIN pg_catalog.pg_attribute a ON r.oid = a.attrelid AND a.attnum > 0
    LEFT JOIN pg_catalog.pg_attrdef ad ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
    LEFT JOIN enums e ON a.atttypid = e.enum_oid
    WHERE a.attisdropped IS NOT TRUE
    ORDER BY r.relationtype, r.schema, r.name, position_number
  `;

  const { rows } = await client.query(sql);

  const tables = new Map<string, TableInfo>();
  const views = new Map<string, TableInfo>();
  const materializedViews = new Map<string, TableInfo>();
  const selectables = new Map<string, TableInfo>();

  for (const row of rows) {
    const key = `"${row.schema}"."${row.name}"`;

    if (!selectables.has(key)) {
      const info: TableInfo = {
        schema: row.schema,
        name: row.name,
        columns: new Map(),
        relationtype: row.relationtype,
        definition: row.definition,
        parentTable: row.parent_table,
        partitionDef: row.partition_def,
        rowSecurity: row.rowsecurity ?? false,
        forceRowSecurity: row.forcerowsecurity ?? false,
        persistence: row.persistence,
        comment: row.comment,
      };
      selectables.set(key, info);

      if (row.relationtype === 'r' || row.relationtype === 'p') {
        tables.set(key, info);
      } else if (row.relationtype === 'v') {
        views.set(key, info);
      } else if (row.relationtype === 'm') {
        materializedViews.set(key, info);
      }
    }

    if (row.attname) {
      const col: ColumnInfo = {
        schema: row.schema,
        tableName: row.name,
        name: row.attname,
        position: row.position_number,
        datatype: row.datatype,
        datatypeString: row.datatypestring,
        notNull: row.not_null,
        default: row.defaultdef,
        isEnum: row.is_enum,
        enumName: row.enum_name,
        enumSchema: row.enum_schema,
        isIdentity: row.is_identity,
        isIdentityAlways: row.is_identity_always,
        isGenerated: row.is_generated,
        collation: row.collation,
      };
      selectables.get(key)!.columns.set(row.attname, col);
    }
  }

  return { tables, views, materializedViews, selectables };
}

async function queryIndexes(client: pg.Client): Promise<Map<string, IndexInfo>> {
  const sql = `
    WITH extension_oids AS (
      SELECT objid FROM pg_depend d
      WHERE d.refclassid = 'pg_extension'::regclass AND d.classid = 'pg_index'::regclass
    ),
    extension_relations AS (
      SELECT objid FROM pg_depend d
      WHERE d.refclassid = 'pg_extension'::regclass AND d.classid = 'pg_class'::regclass
    )
    SELECT
      n.nspname AS schema, c.relname AS table_name, i.relname AS name,
      pg_get_indexdef(i.oid) AS definition,
      (SELECT array_agg(attname ORDER BY ik.n)::text[]
       FROM unnest(x.indkey) WITH ORDINALITY ik(i, n)
       JOIN pg_attribute aa ON aa.attrelid = x.indrelid AND ik.i = aa.attnum
      ) AS index_columns,
      x.indisunique AS is_unique, x.indisprimary AS is_pk,
      am.amname AS algorithm,
      x.indnatts AS key_column_count,
      pg_get_expr(x.indpred, x.indrelid) AS partial_predicate
    FROM pg_index x
    JOIN pg_class c ON c.oid = x.indrelid
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_am am ON i.relam = am.oid
    LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN extension_oids e ON i.oid = e.objid
    LEFT JOIN extension_relations er ON c.oid = er.objid
    WHERE x.indislive
      AND c.relkind IN ('r','m','p') AND i.relkind IN ('i','I')
      AND e.objid IS NULL AND er.objid IS NULL
      ${skipInternal()}
    ORDER BY 1, 2, 3
  `;

  const { rows } = await client.query(sql);
  const result = new Map<string, IndexInfo>();

  for (const row of rows) {
    const key = `"${row.schema}"."${row.name}"`;
    const cols = row.index_columns || [];
    result.set(key, {
      schema: row.schema,
      tableName: row.table_name,
      name: row.name,
      definition: row.definition,
      isUnique: row.is_unique,
      isPk: row.is_pk,
      algorithm: row.algorithm,
      keyColumns: cols.slice(0, row.key_column_count),
      includedColumns: cols.slice(row.key_column_count),
      partialPredicate: row.partial_predicate,
    });
  }

  return result;
}

async function queryConstraints(client: pg.Client): Promise<Map<string, ConstraintInfo>> {
  const sql = `
    WITH extension_oids AS (
      SELECT objid FROM pg_depend d
      WHERE d.refclassid = 'pg_extension'::regclass AND d.classid = 'pg_constraint'::regclass
    ),
    extension_rels AS (
      SELECT objid FROM pg_depend d
      WHERE d.refclassid = 'pg_extension'::regclass AND d.classid = 'pg_class'::regclass
    )
    SELECT
      n.nspname AS schema, con.conname AS name, c.relname AS table_name,
      pg_get_constraintdef(con.oid) AS definition,
      CASE con.contype
        WHEN 'c' THEN 'CHECK' WHEN 'f' THEN 'FOREIGN KEY'
        WHEN 'p' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE' WHEN 'x' THEN 'EXCLUDE'
      END AS constraint_type,
      con.condeferrable AS is_deferrable,
      con.condeferred AS initially_deferred,
      CASE WHEN con.contype = 'f' THEN
        (SELECT ns2.nspname FROM pg_class c2 JOIN pg_namespace ns2 ON c2.relnamespace = ns2.oid WHERE c2.oid = con.confrelid)
      END AS foreign_table_schema,
      CASE WHEN con.contype = 'f' THEN
        (SELECT c2.relname FROM pg_class c2 WHERE c2.oid = con.confrelid)
      END AS foreign_table_name,
      CASE WHEN con.contype = 'f' THEN
        (SELECT array_agg(ta.attname ORDER BY ck.rn)::text[] FROM pg_attribute ta
         JOIN unnest(con.conkey) WITH ORDINALITY ck(cn, rn) ON ta.attrelid = con.conrelid AND ta.attnum = ck.cn)
      END AS fk_columns_local,
      CASE WHEN con.contype = 'f' THEN
        (SELECT array_agg(ta.attname ORDER BY ck.rn)::text[] FROM pg_attribute ta
         JOIN unnest(con.confkey) WITH ORDINALITY ck(cn, rn) ON ta.attrelid = con.confrelid AND ta.attnum = ck.cn)
      END AS fk_columns_foreign
    FROM pg_constraint con
    INNER JOIN pg_class c ON con.conrelid = c.oid
    INNER JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN extension_oids e ON con.oid = e.objid
    LEFT JOIN extension_rels er ON c.oid = er.objid
    WHERE con.contype IN ('c','f','p','u','x')
      AND e.objid IS NULL AND er.objid IS NULL
      ${skipInternal()}
    ORDER BY 1, 3, 2
  `;

  const { rows } = await client.query(sql);
  const result = new Map<string, ConstraintInfo>();

  for (const row of rows) {
    const key = `"${row.schema}"."${row.table_name}"."${row.name}"`;
    result.set(key, {
      schema: row.schema,
      name: row.name,
      tableName: row.table_name,
      definition: row.definition,
      constraintType: row.constraint_type,
      isDeferrable: row.is_deferrable,
      initiallyDeferred: row.initially_deferred,
      foreignTableSchema: row.foreign_table_schema,
      foreignTableName: row.foreign_table_name,
      fkColumnsLocal: row.fk_columns_local,
      fkColumnsForeign: row.fk_columns_foreign,
    });
  }

  return result;
}

async function queryEnums(client: pg.Client): Promise<Map<string, EnumInfo>> {
  const sql = `
    WITH extension_oids AS (
      SELECT objid FROM pg_depend d
      WHERE d.refclassid = 'pg_extension'::regclass AND d.classid = 'pg_type'::regclass
    )
    SELECT n.nspname AS "schema", t.typname AS "name",
      ARRAY(SELECT e.enumlabel FROM pg_catalog.pg_enum e
            WHERE e.enumtypid = t.oid ORDER BY e.enumsortorder)::text[] AS elements
    FROM pg_catalog.pg_type t
    LEFT JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    LEFT OUTER JOIN extension_oids e ON t.oid = e.objid
    WHERE t.typcategory = 'E' AND e.objid IS NULL
      ${skipInternal()}
    ORDER BY 1, 2
  `;

  const { rows } = await client.query(sql);
  const result = new Map<string, EnumInfo>();

  for (const row of rows) {
    const key = `"${row.schema}"."${row.name}"`;
    result.set(key, { schema: row.schema, name: row.name, elements: row.elements });
  }

  return result;
}

async function querySequences(client: pg.Client): Promise<Map<string, SequenceInfo>> {
  const sql = `
    WITH extension_objids AS (
      SELECT objid AS extension_objid FROM pg_depend d
      WHERE d.refclassid = 'pg_extension'::regclass AND d.classid = 'pg_class'::regclass
    )
    SELECT n.nspname AS schema, c.relname AS name,
      c_ref.relname AS table_name, a.attname AS column_name,
      d.deptype IS NOT DISTINCT FROM 'i' AS is_identity
    FROM pg_class c
    INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN extension_objids ON c.oid = extension_objids.extension_objid
    LEFT JOIN pg_depend d ON c.oid = d.objid AND d.deptype IN ('i','a')
    LEFT JOIN pg_class c_ref ON d.refobjid = c_ref.oid
    LEFT JOIN pg_attribute a ON a.attnum = d.refobjsubid AND a.attrelid = d.refobjid
    WHERE c.relkind = 'S'
      AND extension_objids.extension_objid IS NULL
      ${skipInternal()}
    ORDER BY 1, 2
  `;

  const { rows } = await client.query(sql);
  const result = new Map<string, SequenceInfo>();

  for (const row of rows) {
    if (row.is_identity) continue; // skip identity sequences
    const key = `"${row.schema}"."${row.name}"`;
    result.set(key, {
      schema: row.schema,
      name: row.name,
      tableName: row.table_name,
      columnName: row.column_name,
      isIdentity: row.is_identity,
    });
  }

  return result;
}

async function queryFunctions(client: pg.Client): Promise<Map<string, FunctionInfo>> {
  const sql = `
    WITH extension_oids AS (
      SELECT objid FROM pg_depend d
      WHERE d.refclassid = 'pg_extension'::regclass AND d.classid = 'pg_proc'::regclass
    )
    SELECT
      n.nspname AS schema, p.proname AS name,
      pg_get_function_result(p.oid) AS result_string,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments,
      CASE WHEN p.prokind = 'p' THEN NULL
           ELSE format_type(p.prorettype, NULL) END AS returntype,
      p.prosrc AS definition,
      pg_get_functiondef(p.oid) AS full_definition,
      upper(l.lanname) AS language,
      CASE p.proisstrict WHEN true THEN 'RETURNS NULL ON NULL INPUT' ELSE 'CALLED ON NULL INPUT' END AS strictness,
      CASE p.prosecdef WHEN true THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security_type,
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' WHEN 'v' THEN 'VOLATILE' END AS volatility,
      p.prokind AS kind,
      pg_catalog.obj_description(p.oid) AS comment
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON p.prolang = l.oid
    LEFT JOIN extension_oids e ON p.oid = e.objid
    WHERE p.prokind != 'a'
      AND e.objid IS NULL
      AND upper(l.lanname) NOT IN ('C', 'INTERNAL')
      ${skipInternal()}
    ORDER BY 1, 2
  `;

  const { rows } = await client.query(sql);
  const result = new Map<string, FunctionInfo>();

  for (const row of rows) {
    const key = `"${row.schema}"."${row.name}"(${row.identity_arguments})`;
    result.set(key, {
      schema: row.schema,
      name: row.name,
      identityArguments: row.identity_arguments,
      returntype: row.returntype,
      definition: row.definition,
      fullDefinition: row.full_definition,
      language: row.language,
      strictness: row.strictness,
      securityType: row.security_type,
      volatility: row.volatility,
      kind: row.kind,
      resultString: row.result_string,
      comment: row.comment,
    });
  }

  return result;
}

async function queryTriggers(client: pg.Client): Promise<Map<string, TriggerInfo>> {
  const sql = `
    WITH extension_oids AS (
      SELECT objid FROM pg_depend d
      WHERE d.refclassid = 'pg_extension'::regclass AND d.classid = 'pg_trigger'::regclass
    )
    SELECT tg.tgname AS name, n.nspname AS schema, cls.relname AS table_name,
      pg_get_triggerdef(tg.oid) AS full_definition,
      proc.proname AS proc_name, nspp.nspname AS proc_schema,
      tg.tgenabled AS enabled
    FROM pg_trigger tg
    JOIN pg_class cls ON cls.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = cls.relnamespace
    JOIN pg_proc proc ON proc.oid = tg.tgfoid
    JOIN pg_namespace nspp ON nspp.oid = proc.pronamespace
    WHERE NOT tg.tgisinternal
      AND NOT tg.oid IN (SELECT objid FROM extension_oids)
      ${skipInternal()}
    ORDER BY schema, table_name, name
  `;

  const { rows } = await client.query(sql);
  const result = new Map<string, TriggerInfo>();

  for (const row of rows) {
    const key = `"${row.schema}"."${row.table_name}"."${row.name}"`;
    result.set(key, {
      schema: row.schema,
      name: row.name,
      tableName: row.table_name,
      fullDefinition: row.full_definition,
      procName: row.proc_name,
      procSchema: row.proc_schema,
      enabled: row.enabled,
    });
  }

  return result;
}

async function queryExtensions(client: pg.Client): Promise<Map<string, ExtensionInfo>> {
  const sql = `
    SELECT n.nspname AS schema, e.extname AS name, e.extversion AS version
    FROM pg_extension e
    INNER JOIN pg_namespace n ON n.oid = e.extnamespace
    ORDER BY schema, name
  `;

  const { rows } = await client.query(sql);
  const result = new Map<string, ExtensionInfo>();

  for (const row of rows) {
    const key = `"${row.schema}"."${row.name}"`;
    result.set(key, { schema: row.schema, name: row.name, version: row.version });
  }

  return result;
}

async function querySchemas(client: pg.Client): Promise<Set<string>> {
  const sql = `
    WITH extension_oids AS (
      SELECT objid FROM pg_depend d
      WHERE d.refclassid = 'pg_extension'::regclass AND d.classid = 'pg_namespace'::regclass
    )
    SELECT n.nspname AS schema
    FROM pg_catalog.pg_namespace n
    LEFT OUTER JOIN extension_oids e ON e.objid = n.oid
    WHERE e.objid IS NULL
      ${skipInternal()}
    ORDER BY 1
  `;

  const { rows } = await client.query(sql);
  return new Set(rows.map((r) => r.schema));
}

async function queryPrivileges(client: pg.Client): Promise<Map<string, PrivilegeInfo>> {
  const sql = `
    SELECT table_schema AS schema, table_name AS name, 'table' AS object_type,
      grantee AS "user", privilege_type AS privilege
    FROM information_schema.role_table_grants
    WHERE grantee != (
      SELECT tableowner FROM pg_tables
      WHERE schemaname = table_schema AND tablename = table_name
    )
    AND table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    AND table_schema NOT LIKE 'pg_temp_%'
    ORDER BY schema, name, "user"
  `;

  const { rows } = await client.query(sql);
  const result = new Map<string, PrivilegeInfo>();

  for (const row of rows) {
    const key = `"${row.schema}"."${row.name}".${row.user}.${row.privilege}`;
    result.set(key, {
      schema: row.schema,
      name: row.name,
      objectType: row.object_type,
      user: row.user,
      privilege: row.privilege,
    });
  }

  return result;
}

async function queryRLSPolicies(client: pg.Client): Promise<Map<string, RLSPolicyInfo>> {
  const sql = `
    SELECT p.polname AS name, n.nspname AS schema, c.relname AS table_name,
      p.polcmd AS commandtype, p.polpermissive AS permissive,
      (SELECT array_agg(CASE WHEN o = 0 THEN 'public' ELSE pg_get_userbyid(o) END)::text[]
       FROM unnest(p.polroles) AS unn(o)) AS roles,
      pg_get_expr(p.polqual, p.polrelid) AS qual,
      pg_get_expr(p.polwithcheck, p.polrelid) AS withcheck
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    ORDER BY 2, 1
  `;

  const { rows } = await client.query(sql);
  const result = new Map<string, RLSPolicyInfo>();

  for (const row of rows) {
    const key = `"${row.schema}"."${row.table_name}"."${row.name}"`;
    result.set(key, {
      schema: row.schema,
      name: row.name,
      tableName: row.table_name,
      commandType: row.commandtype,
      permissive: row.permissive,
      roles: row.roles || [],
      qual: row.qual,
      withCheck: row.withcheck,
    });
  }

  return result;
}
