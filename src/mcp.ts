/**
 * MCP Server for @indiekit/pg-diff
 * Exposes schema diffing as MCP tools via stdio transport.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { diff } from './index.js';

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: 'pg-diff',
    version: '0.1.0',
  });

  server.tool(
    'diff_schemas',
    'Compare two PostgreSQL databases and return migration SQL with metadata',
    {
      fromUrl: z.string().describe('Connection string for the source (current) database'),
      toUrl: z.string().describe('Connection string for the target (desired) database'),
      safe: z.boolean().optional().describe('If true, omit DROP statements'),
      ignoreExtensionVersions: z.boolean().optional().describe('Ignore extension version differences'),
    },
    async ({ fromUrl, toUrl, safe, ignoreExtensionVersions }) => {
      const result = await diff(fromUrl, toUrl, { safe, ignoreExtensionVersions });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'diff_summary',
    'Compare two PostgreSQL databases and return a human-readable summary',
    {
      fromUrl: z.string().describe('Connection string for the source (current) database'),
      toUrl: z.string().describe('Connection string for the target (desired) database'),
      safe: z.boolean().optional().describe('If true, omit DROP statements'),
    },
    async ({ fromUrl, toUrl, safe }) => {
      const result = await diff(fromUrl, toUrl, { safe });
      const { summary } = result;

      const lines: string[] = [];
      if (summary.added.length === 0 && summary.removed.length === 0 && summary.modified.length === 0) {
        lines.push('No differences found.');
      } else {
        lines.push(`${result.statements.length} statement(s) to migrate:\n`);
        if (summary.added.length) {
          lines.push(`Added (${summary.added.length}):`);
          summary.added.forEach((s) => lines.push(`  + ${s}`));
        }
        if (summary.removed.length) {
          lines.push(`Removed (${summary.removed.length}):`);
          summary.removed.forEach((s) => lines.push(`  - ${s}`));
        }
        if (summary.modified.length) {
          lines.push(`Modified (${summary.modified.length}):`);
          summary.modified.forEach((s) => lines.push(`  ~ ${s}`));
        }
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
