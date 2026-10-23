#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { DrimeClient } from './drime-client.js';
import { registerAllTools } from './tools/index.js';
import { log, logError } from './logger.js';

async function main() {
  const config = loadConfig();

  const client = new DrimeClient({ token: config.drimeToken });

  // Validate the token by fetching the logged-in user
  try {
    const user = await client.getLoggedUser();
    log(`Authenticated as ${user.display_name} (${user.email})`);
  } catch (err) {
    logError(`Authentication failed: ${err instanceof Error ? err.message : String(err)}`);
    logError('Please check your DRIME_API_TOKEN.');
    process.exit(1);
  }

  if (config.readOnly) {
    log('Running in read-only mode (default). Set DRIME_READ_ONLY=false to enable write operations.');
  } else {
    log('Write operations ENABLED (DRIME_READ_ONLY=false). Upload, create, delete, and move are active.');
  }

  const server = new McpServer(
    {
      name: 'drime-mcp',
      version: '0.1.0',
    },
    {
      // Cap combined array/object members per tool call — DoS safeguard
      maxToolInputElements: 1000,
      instructions:
        'Drime Cloud MCP server. Browse, search, read, upload, and manage files in your Drime Cloud storage. ' +
        'Use drime_list_files to browse directories, drime_search_files to find files by name, ' +
        'drime_read_file to read text file contents, drime_get_file_info for metadata. ' +
        'All file operations use the hash or entry ID from listing/search results.',
    },
  );

  registerAllTools(server, client, config.readOnly);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log('Server running on stdio. Ready for connections.');
}

main().catch((err) => {
  logError(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
