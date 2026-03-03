[English](README.md) | [中文](README.zh-CN.md)

# @indiekit/pg-diff

[![npm](https://img.shields.io/npm/v/@indiekit/pg-diff)](https://www.npmjs.com/package/@indiekit/pg-diff)
[![license](https://img.shields.io/npm/l/@indiekit/pg-diff)](./LICENSE)

PostgreSQL schema diff — compares two databases and generates migration SQL.

A pure-TypeScript alternative to Python's [migra](https://github.com/djrobstep/migra).

## Features

Supported object types:

- **Tables** — columns, types, defaults, NOT NULL, generated columns, partitioned tables, unlogged tables
- **Views** — regular and materialized
- **Indexes** — including partial indexes and INCLUDE columns
- **Constraints** — PRIMARY KEY, UNIQUE, CHECK, FOREIGN KEY, EXCLUDE
- **Enums** — create, drop, and safe in-place modification
- **Functions & Procedures** — full definition comparison
- **Triggers** — create, drop, modify
- **Sequences** — with ownership tracking
- **Schemas** — create/drop
- **Extensions** — with optional version ignoring
- **RLS Policies** — row-level security policies
- **Privileges** — GRANT/REVOKE tracking

## Install

```bash
npm install @indiekit/pg-diff
```

## Quick Start

```bash
# Generate migration SQL
pg-diff postgresql://localhost/db_old postgresql://localhost/db_new

# Apply directly
pg-diff postgres://localhost/old postgres://localhost/new | psql postgres://localhost/old
```

## CLI Usage

```
pg-diff <from_url> <to_url> [options]
```

### Options

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON (machine-readable) |
| `--safe` | Omit all DROP statements |
| `--ignore-extension-versions` | Ignore extension version differences |
| `--mcp` | Start as MCP server (stdio) |
| `--help` | Show help with examples |

### Examples

```bash
# Plain SQL output (default)
pg-diff postgres://localhost/old postgres://localhost/new

# JSON output for scripting / agents
pg-diff --json postgres://localhost/old postgres://localhost/new

# Safe mode — no destructive changes
pg-diff --safe postgres://localhost/old postgres://localhost/new
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success (or no differences) |
| `1` | Error |

## API

```typescript
import { diff } from '@indiekit/pg-diff';

const result = await diff(
  'postgresql://localhost/db_old',
  'postgresql://localhost/db_new',
  { safe: true }
);

console.log(result.sql);           // Migration SQL string
console.log(result.statements);    // Individual SQL statements
console.log(result.summary);       // { added: [...], removed: [...], modified: [...] }
```

### Lower-level API

```typescript
import { inspectSchema, computeDiff } from '@indiekit/pg-diff';

const from = await inspectSchema('postgresql://localhost/db_old');
const to = await inspectSchema('postgresql://localhost/db_new');
const result = computeDiff(from, to, { safe: false });
```

### Types

All types are exported:

```typescript
import type { DiffResult, DiffOptions, SchemaObjects } from '@indiekit/pg-diff';
```

## MCP Server

pg-diff exposes an [MCP](https://modelcontextprotocol.io/) server for AI agent integration.

### Start

```bash
pg-diff --mcp
```

### Configuration

Add to your MCP client config (e.g. Claude Desktop):

```json
{
  "mcpServers": {
    "pg-diff": {
      "command": "npx",
      "args": ["@indiekit/pg-diff", "--mcp"]
    }
  }
}
```

### Tools

| Tool | Description |
|------|-------------|
| `diff_schemas` | Compare two databases, returns full JSON result (SQL + statements + summary) |
| `diff_summary` | Compare two databases, returns human-readable summary |

Both tools accept `fromUrl`, `toUrl`, and optional `safe` parameter.

## Safe Mode (`--safe`)

When `--safe` is enabled, all statements containing `DROP` are filtered out. This includes:

- `DROP TABLE`, `DROP VIEW`, `DROP INDEX`
- `DROP COLUMN`, `DROP CONSTRAINT`
- `DROP FUNCTION`, `DROP TRIGGER`
- Any other destructive operation

Use this for production migrations where you want to review destructive changes separately.

## vs Python migra

| | **pg-diff** | **migra** |
|---|---|---|
| Language | TypeScript/Node.js | Python |
| Install | `npm install` | `pip install` |
| MCP Server | ✅ Built-in | ❌ |
| JSON Output | ✅ `--json` | ❌ |
| Safe Mode | ✅ `--safe` | ✅ `--unsafe` (inverted) |
| API | ✅ ESM + CJS | ✅ Python |
| Maintenance | Active | Unmaintained |

## License

MIT
