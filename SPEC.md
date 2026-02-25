# pg-diff - PostgreSQL Schema Diff

## Overview
Port of Python's migra (https://github.com/djrobstep/migra) to TypeScript.
Like `diff` but for PostgreSQL schemas - compares two databases and generates migration SQL.
Reference code at /tmp/migra/

## Core Concept
Given two PG databases (or schemas), generate the ALTER/CREATE/DROP statements needed to transform one into the other.

## Architecture
```
src/
  index.ts        - Public API: diff(from, to)
  differ.ts       - Core diff logic (port migra/changes.py - 668 lines)
  statements.ts   - SQL statement generation
  types.ts        - TypeScript interfaces
  cli.ts          - CLI entry point
  mcp.ts          - MCP server
```

## API
```typescript
import { diff } from '@indiekit/pg-diff';

// Compare two databases
const migration = await diff(
  'postgresql://localhost/db_old',
  'postgresql://localhost/db_new'
);

console.log(migration.sql);      // Full migration SQL
console.log(migration.statements); // Individual statements
console.log(migration.summary);   // Human-readable summary
```

## CLI
```bash
npx @indiekit/pg-diff postgresql://localhost/old postgresql://localhost/new
npx @indiekit/pg-diff --json postgresql://localhost/old postgresql://localhost/new
```

## What to Diff
Study /tmp/migra/migra/changes.py carefully. It diffs:
- Tables (columns, types, defaults, nullability)
- Indexes (create/drop)
- Constraints (PK, FK, unique, check)
- Views and materialized views
- Functions
- Sequences
- Enums
- Triggers
- Extensions
- RLS policies
- Schemas
- Privileges

## Dependencies
Use @indiekit/pg-inspect (at /root/source/side-projects/pg-inspect/) for schema inspection.
Import it as a local dependency or copy the inspection logic.
For simplicity, use `pg` directly and re-implement inspection inline if needed.

## Testing
Create two test databases with known differences and verify the diff output:
```bash
sudo -u postgres createdb pg_diff_test_a
sudo -u postgres createdb pg_diff_test_b
```

## Package: @indiekit/pg-diff, ESM+CJS, vitest, tsup
