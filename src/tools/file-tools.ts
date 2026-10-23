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

function formatFileEntry(entry: Record<string, unknown>): string {
  const parts = [
    `  - ${entry.type === 'folder' ? '[DIR] ' : '[FILE] '}${entry.name}`,
    `    id: ${entry.id}  hash: ${entry.hash}`,
  ];
  if (entry.type !== 'folder' && entry.file_size != null) {
    parts.push(`    size: ${formatBytes(Number(entry.file_size))}  mime: ${entry.mime ?? 'unknown'}`);
  }
  parts.push(`    modified: ${entry.updated_at}`);
  return parts.join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ---- drime_list_files ----

export function registerListFilesTool(server: McpServer, client: DrimeClient) {
  server.registerTool(
    'drime_list_files',
    {
      description: 'List files and folders in a Drime Cloud directory. Supports filtering by type, sorting, and pagination. Use folderId (hash) to browse inside a specific folder, or omit for root.',
      inputSchema: {
        folderId: z.string().optional().describe('Folder hash to list contents of. Omit for root directory.'),
        workspaceId: z.number().int().default(0).describe('Workspace ID. Use 0 for personal workspace.'),
        type: z.enum(['folder', 'image', 'text', 'audio', 'video', 'pdf']).optional().describe('Filter by file type.'),
        query: z.string().optional().describe('Search query to filter by name.'),
        starredOnly: z.boolean().optional().describe('Return only starred entries.'),
        recentOnly: z.boolean().optional().describe('Return only recently accessed entries.'),
        sharedOnly: z.boolean().optional().describe('Return only entries shared with you.'),
        deletedOnly: z.boolean().optional().describe('Return only trashed entries.'),
        orderBy: z.enum(['updated_at', 'created_at', 'name', 'file_size']).default('name').describe('Sort field.'),
        orderDir: z.enum(['asc', 'desc']).default('asc').describe('Sort direction.'),
        perPage: z.number().int().min(1).max(200).default(50).describe('Number of entries per page.'),
        page: z.number().int().min(1).default(1).describe('Page number (1-indexed).'),
      },
    },
    async (params) => {
      try {
        const result = await client.listFileEntries({
          workspaceId: params.workspaceId,
          folderId: params.folderId,
          type: params.type,
          query: params.query,
          starredOnly: params.starredOnly,
          recentOnly: params.recentOnly,
          sharedOnly: params.sharedOnly,
          deletedOnly: params.deletedOnly,
          orderBy: params.orderBy,
          orderDir: params.orderDir,
          perPage: params.perPage,
          page: params.page,
        });

        const header = result.folder
          ? `Folder: ${result.folder.name} (${result.total} items, page ${result.current_page}/${result.last_page})`
          : `Root directory (${result.total} items, page ${result.current_page}/${result.last_page})`;

        const lines = result.data.map((e) => formatFileEntry(e as unknown as Record<string, unknown>));
        const body = lines.length > 0 ? lines.join('\n') : '(empty)';

        return textResult(`${header}\n\n${body}`);
      } catch (err) {
        return textResult(formatError(err), true);
      }
    },
  );
}

// ---- drime_search_files ----

export function registerSearchFilesTool(server: McpServer, client: DrimeClient) {
  server.registerTool(
    'drime_search_files',
    {
      description: 'Search for files and folders in Drime Cloud by name. Returns matching entries across all directories.',
      inputSchema: {
        query: z.string().min(1).describe('Search query (matches file/folder names).'),
        workspaceId: z.number().int().default(0).describe('Workspace ID. Use 0 for personal workspace.'),
        type: z.enum(['folder', 'image', 'text', 'audio', 'video', 'pdf']).optional().describe('Filter by file type.'),
        perPage: z.number().int().min(1).max(200).default(50).describe('Number of results per page.'),
        page: z.number().int().min(1).default(1).describe('Page number (1-indexed).'),
      },
    },
    async (params) => {
      try {
        const result = await client.listFileEntries({
          workspaceId: params.workspaceId,
          query: params.query,
          type: params.type,
          orderBy: 'name',
          orderDir: 'asc',
          perPage: params.perPage,
          page: params.page,
        });

        const header = `Search results for "${params.query}" (${result.total} matches, page ${result.current_page}/${result.last_page})`;
        const lines = result.data.map((e) => formatFileEntry(e as unknown as Record<string, unknown>));
        const body = lines.length > 0 ? lines.join('\n') : '(no matches)';

        return textResult(`${header}\n\n${body}`);
      } catch (err) {
        return textResult(formatError(err), true);
      }
    },
  );
}

// ---- drime_get_file_info ----

export function registerGetFileInfoTool(server: McpServer, client: DrimeClient) {
  server.registerTool(
    'drime_get_file_info',
    {
      description: 'Get detailed metadata for a specific file or folder in Drime Cloud, including size, type, hash, timestamps, and sharing info.',
      inputSchema: {
        entryId: z.number().int().describe('The file entry ID (numeric).'),
        workspaceId: z.number().int().default(0).describe('Workspace ID. Use 0 for personal workspace.'),
      },
    },
    async ({ entryId, workspaceId }) => {
      try {
        const entry = await client.getFileEntry(entryId, workspaceId);
        return textResult(JSON.stringify(entry, null, 2));
      } catch (err) {
        return textResult(formatError(err), true);
      }
    },
  );
}

// ---- drime_get_folders ----

export function registerGetFoldersTool(server: McpServer, client: DrimeClient) {
  server.registerTool(
    'drime_get_folders',
    {
      description: 'Get the folder tree structure for a Drime Cloud workspace. Useful for navigating the directory hierarchy.',
      inputSchema: {
        workspaceId: z.number().int().default(0).describe('Workspace ID. Use 0 for personal workspace.'),
      },
    },
    async ({ workspaceId }) => {
      try {
        const folders = await client.getUserFolders(workspaceId);
        return textResult(JSON.stringify(folders, null, 2));
      } catch (err) {
        return textResult(formatError(err), true);
      }
    },
  );
}
