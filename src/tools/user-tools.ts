import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DrimeClient } from '../drime-client.js';
import { DrimeApiError } from '../drime-client.js';

function formatError(error: unknown): string {
  if (error instanceof DrimeApiError) {
    let msg = `Drime API error (${error.statusCode}): ${error.message}`;
    if (error.details) {
      msg += ` — ${JSON.stringify(error.details)}`;
    }
    return msg;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function textResult(text: string, isError = false) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(isError ? { isError: true } : {}),
  };
}

// ---- drime_get_user ----

export function registerGetUserTool(server: McpServer, client: DrimeClient) {
  server.registerTool(
    'drime_get_user',
    {
      description: 'Get information about the currently authenticated Drime Cloud user (name, email, account details).',
    },
    async () => {
      try {
        const user = await client.getLoggedUser();
        return textResult(JSON.stringify(user, null, 2));
      } catch (err) {
        return textResult(formatError(err), true);
      }
    },
  );
}

// ---- drime_list_workspaces ----

export function registerListWorkspacesTool(server: McpServer, client: DrimeClient) {
  server.registerTool(
    'drime_list_workspaces',
    {
      description: 'List all Drime Cloud workspaces the user has access to. Use workspaceId=0 for the personal workspace.',
    },
    async () => {
      try {
        const workspaces = await client.getWorkspaces();
        return textResult(JSON.stringify(workspaces, null, 2));
      } catch (err) {
        return textResult(formatError(err), true);
      }
    },
  );
}

// ---- drime_get_space_usage ----

export function registerGetSpaceUsageTool(server: McpServer, client: DrimeClient) {
  server.registerTool(
    'drime_get_space_usage',
    {
      description: 'Get storage space usage for the current user or a specific workspace.',
      inputSchema: {
        workspaceId: z.number().int().default(0).describe('Workspace ID. Use 0 for personal workspace.'),
      },
    },
    async ({ workspaceId }) => {
      try {
        const usage = await client.getSpaceUsage(workspaceId);
        return textResult(JSON.stringify(usage, null, 2));
      } catch (err) {
        return textResult(formatError(err), true);
      }
    },
  );
}
