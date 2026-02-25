/**
 * CLI entry point for @indiekit/pg-diff
 */
import { diff } from './index.js';

const HELP = `
pg-diff - PostgreSQL schema diff tool

Usage:
  pg-diff <from_url> <to_url> [options]
  pg-diff --mcp

Options:
  --json                        Output as JSON (machine-readable)
  --safe                        Omit DROP statements (safe migrations)
  --ignore-extension-versions   Ignore extension version differences
  --mcp                         Start as MCP server (stdio transport)
  --help, -h                    Show this help

Examples:
  # Generate migration SQL
  pg-diff postgresql://localhost/db_old postgresql://localhost/db_new

  # Safe mode (no DROP statements)
  pg-diff --safe postgresql://localhost/db_old postgresql://localhost/db_new

  # JSON output for scripting
  pg-diff --json postgresql://localhost/db_old postgresql://localhost/db_new

  # Pipe to psql
  pg-diff postgres://localhost/old postgres://localhost/new | psql postgres://localhost/old

  # Start MCP server
  pg-diff --mcp

Exit codes:
  0  Success (or no differences)
  1  Error
`.trim();

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }

  if (args.includes('--mcp')) {
    const { startMcpServer } = await import('./mcp.js');
    await startMcpServer();
    return;
  }

  const jsonMode = args.includes('--json');
  const safeMode = args.includes('--safe');
  const ignoreExtVersions = args.includes('--ignore-extension-versions');
  const urls = args.filter((a) => !a.startsWith('--'));

  if (urls.length < 2) {
    console.error('Usage: pg-diff [options] <from_url> <to_url>');
    console.error('Run pg-diff --help for more information.');
    process.exit(1);
  }

  try {
    const result = await diff(urls[0], urls[1], {
      safe: safeMode,
      ignoreExtensionVersions: ignoreExtVersions,
    });

    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.sql) {
      process.stdout.write(result.sql);
    } else {
      console.error('-- No differences found');
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
