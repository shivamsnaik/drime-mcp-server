import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DrimeClient } from '../drime-client.js';
import {
  registerGetUserTool,
  registerListWorkspacesTool,
  registerGetSpaceUsageTool,
} from './user-tools.js';
import {
  registerListFilesTool,
  registerSearchFilesTool,
  registerGetFileInfoTool,
  registerGetFoldersTool,
} from './file-tools.js';
import { registerReadFileTool } from './content-tools.js';
import {
  registerUploadFileTool,
  registerCreateFolderTool,
  registerDeleteFilesTool,
  registerMoveFilesTool,
} from './write-tools.js';

export function registerAllTools(server: McpServer, client: DrimeClient, readOnly: boolean): void {
  // User & workspace tools (read-only)
  registerGetUserTool(server, client);
  registerListWorkspacesTool(server, client);
  registerGetSpaceUsageTool(server, client);

  // File browsing tools (read-only)
  registerListFilesTool(server, client);
  registerSearchFilesTool(server, client);
  registerGetFileInfoTool(server, client);
  registerGetFoldersTool(server, client);

  // File content tools (read-only)
  registerReadFileTool(server, client);

  // Write tools (respect read-only mode)
  registerUploadFileTool(server, client, readOnly);
  registerCreateFolderTool(server, client, readOnly);
  registerDeleteFilesTool(server, client, readOnly);
  registerMoveFilesTool(server, client, readOnly);
}
