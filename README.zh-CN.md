[English](README.md) | [中文](README.zh-CN.md)

# @indiekit/pg-diff

[![npm](https://img.shields.io/npm/v/@indiekit/pg-diff)](https://www.npmjs.com/package/@indiekit/pg-diff)
[![license](https://img.shields.io/npm/l/@indiekit/pg-diff)](./LICENSE)

PostgreSQL Schema Diff —— 比较两个数据库并生成迁移 SQL。

Python [migra](https://github.com/djrobstep/migra) 的纯 TypeScript 替代方案。

## 功能

支持的对象类型：

- **表** —— 列、类型、默认值、NOT NULL、生成列、分区表、Unlogged 表
- **视图** —— 普通视图和物化视图
- **索引** —— 包括部分索引和 INCLUDE 列
- **约束** —— PRIMARY KEY、UNIQUE、CHECK、FOREIGN KEY、EXCLUDE
- **枚举** —— 创建、删除和安全的原地修改
- **函数和过程** —— 完整定义对比
- **触发器** —— 创建、删除、修改
- **序列** —— 含所有权追踪
- **Schema** —— 创建/删除
- **扩展** —— 支持忽略版本差异
- **RLS 策略** —— 行级安全策略
- **权限** —— GRANT/REVOKE 追踪

## 安装

```bash
npm install @indiekit/pg-diff
```

## 快速开始

```bash
# 生成迁移 SQL
pg-diff postgresql://localhost/db_old postgresql://localhost/db_new

# 直接应用
pg-diff postgres://localhost/old postgres://localhost/new | psql postgres://localhost/old
```

## CLI 用法

```
pg-diff <from_url> <to_url> [options]
```

### 选项

| 参数 | 描述 |
|------|------|
| `--json` | JSON 格式输出（机器可读） |
| `--safe` | 省略所有 DROP 语句 |
| `--ignore-extension-versions` | 忽略扩展版本差异 |
| `--mcp` | 以 MCP Server 模式启动（stdio） |
| `--help` | 显示帮助和示例 |

### 示例

```bash
# 纯 SQL 输出（默认）
pg-diff postgres://localhost/old postgres://localhost/new

# JSON 输出，方便脚本 / Agent 使用
pg-diff --json postgres://localhost/old postgres://localhost/new

# 安全模式 —— 不包含破坏性变更
pg-diff --safe postgres://localhost/old postgres://localhost/new
```

### 退出码

| 代码 | 含义 |
|------|------|
| `0` | 成功（或无差异） |
| `1` | 错误 |

## API

```typescript
import { diff } from '@indiekit/pg-diff';

const result = await diff(
  'postgresql://localhost/db_old',
  'postgresql://localhost/db_new',
  { safe: true }
);

console.log(result.sql);           // 迁移 SQL 字符串
console.log(result.statements);    // 独立的 SQL 语句
console.log(result.summary);       // { added: [...], removed: [...], modified: [...] }
```

### 底层 API

```typescript
import { inspectSchema, computeDiff } from '@indiekit/pg-diff';

const from = await inspectSchema('postgresql://localhost/db_old');
const to = await inspectSchema('postgresql://localhost/db_new');
const result = computeDiff(from, to, { safe: false });
```

### 类型

所有类型均已导出：

```typescript
import type { DiffResult, DiffOptions, SchemaObjects } from '@indiekit/pg-diff';
```

## MCP Server

pg-diff 暴露了 [MCP](https://modelcontextprotocol.io/) 服务器，支持 AI Agent 集成。

### 启动

```bash
pg-diff --mcp
```

### 配置

添加到你的 MCP 客户端配置（如 Claude Desktop）：

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

### 工具

| 工具 | 描述 |
|------|------|
| `diff_schemas` | 比较两个数据库，返回完整 JSON 结果（SQL + 语句 + 摘要） |
| `diff_summary` | 比较两个数据库，返回人类可读的摘要 |

两个工具都接受 `fromUrl`、`toUrl` 和可选的 `safe` 参数。

## 安全模式 (`--safe`)

启用 `--safe` 后，所有包含 `DROP` 的语句都会被过滤掉，包括：

- `DROP TABLE`、`DROP VIEW`、`DROP INDEX`
- `DROP COLUMN`、`DROP CONSTRAINT`
- `DROP FUNCTION`、`DROP TRIGGER`
- 任何其他破坏性操作

建议在生产环境迁移时使用此模式，单独审查破坏性变更。

## 与 Python migra 的对比

| | **pg-diff** | **migra** |
|---|---|---|
| 语言 | TypeScript/Node.js | Python |
| 安装 | `npm install` | `pip install` |
| MCP Server | ✅ 内置 | ❌ |
| JSON 输出 | ✅ `--json` | ❌ |
| 安全模式 | ✅ `--safe` | ✅ `--unsafe`（反转） |
| API | ✅ ESM + CJS | ✅ Python |
| 维护 | 活跃 | 已停止维护 |

## 许可证

MIT
