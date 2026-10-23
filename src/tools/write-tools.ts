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

function requireWriteAccess(readOnly: boolean): string | null {
  if (readOnly) {
    return 'This server is running in read-only mode (DRIME_READ_ONLY=true). Write operations are disabled.';
  }
  return null;
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB — Drime direct upload limit

// A safe filename: no path separators, no traversal, no control characters
const SAFE_FILENAME = /^[^/\\\u0000-\u001f]{1,255}$/;

function validateFileName(name: string): string | null {
  if (!SAFE_FILENAME.test(name)) {
    return `Invalid fileName "${name}": must not contain path separators, "..", or control characters.`;
  }
  if (name === '.' || name === '..' || name.includes('..')) {
    return `Invalid fileName "${name}": path traversal sequences are not allowed.`;
  }
  return null;
}

// A safe relativePath: starts with "/", no ".." segments, no backslashes, no control characters
function validateRelativePath(path: string): string | null {
  if (!path.startsWith('/')) {
    return 'relativePath must start with "/" (e.g., "/projects/docs/").';
  }
  if (/[\\\u0000-\u001f]/.test(path)) {
    return 'relativePath must not contain backslashes or control characters.';
  }
  const segments = path.split('/').filter(Boolean);
  if (segments.includes('..')) {
    return 'relativePath must not contain ".." segments.';
  }
  return null;
}

// ---- drime_upload_file ----

export function registerUploadFileTool(server: McpServer, client: DrimeClient, readOnly: boolean) {
  server.registerTool(
    'drime_upload_file',
    {
      description: 'Upload a file to Drime Cloud. The file content is provided as base64-encoded data. Files up to 5MB are supported via direct upload.',
      inputSchema: {
        fileName: z.string().min(1).describe('Name for the uploaded file (e.g., "document.pdf").'),
        contentBase64: z.string().regex(/^[A-Za-z0-9+/=\s]+$/, 'Must be valid base64.').describe('File content encoded as base64. Max 5MB decoded.'),
        parentId: z.number().int().nullable().optional().describe('ID of the destination folder. Omit or null for root.'),
        workspaceId: z.number().int().default(0).describe('Workspace ID. Use 0 for personal workspace.'),
        relativePath: z.string().optional().describe('Optional folder path (e.g., "/projects/docs/"). Folders will be auto-created.'),
      },
    },
    async (params) => {
      const blocked = requireWriteAccess(readOnly);
      if (blocked) return textResult(blocked, true);

      const nameError = validateFileName(params.fileName);
      if (nameError) return textResult(nameError, true);

      if (params.relativePath) {
        const pathError = validateRelativePath(params.relativePath);
        if (pathError) return textResult(pathError, true);
      }

      try {
        // Decode base64 to Uint8Array
        const buffer = Buffer.from(params.contentBase64, 'base64');
        const uint8 = new Uint8Array(buffer);

        if (uint8.byteLength === 0) {
          return textResult('File content is empty. Nothing to upload.', true);
        }
        if (uint8.byteLength > MAX_UPLOAD_BYTES) {
          return textResult(
            `File too large: ${uint8.byteLength} bytes (limit is ${MAX_UPLOAD_BYTES} bytes). ` +
            'For larger files, upload directly via the Drime app or API multipart flow.',
            true,
          );
        }

        const entry = await client.uploadFile({
          file: uint8,
          fileName: params.fileName,
          parentId: params.parentId ?? null,
          workspaceId: params.workspaceId,
          relativePath: params.relativePath,
        });

        return textResult(
          `Uploaded "${entry.name}" successfully.\n` +
          `  id: ${entry.id}\n` +
          `  hash: ${entry.hash}\n` +
          `  size: ${entry.file_size} bytes\n` +
          `  type: ${entry.type}`,
        );
      } catch (err) {
        return textResult(formatError(err), true);
      }
    },
  );
}

// ---- drime_create_folder ----

export function registerCreateFolderTool(server: McpServer, client: DrimeClient, readOnly: boolean) {
  server.registerTool(
    'drime_create_folder',
    {
      description: 'Create a new folder in Drime Cloud.',
      inputSchema: {
        name: z.string().min(1).describe('Name for the new folder.'),
        parentId: z.number().int().nullable().optional().describe('ID of the parent folder. Omit or null for root.'),
        workspaceId: z.number().int().default(0).describe('Workspace ID. Use 0 for personal workspace.'),
      },
    },
    async (params) => {
      const blocked = requireWriteAccess(readOnly);
      if (blocked) return textResult(blocked, true);

      try {
        const folder = await client.createFolder(params.name, params.parentId ?? null, params.workspaceId);
        return textResult(
          `Created folder "${folder.name}".\n` +
          `  id: ${folder.id}\n` +
          `  hash: ${folder.hash}`,
        );
      } catch (err) {
        return textResult(formatError(err), true);
      }
    },
  );
}

// ---- drime_delete_files ----

export function registerDeleteFilesTool(server: McpServer, client: DrimeClient, readOnly: boolean) {
  server.registerTool(
    'drime_delete_files',
    {
      description: 'Delete files or folders from Drime Cloud (moves them to trash). Provide one or more entry IDs.',
      inputSchema: {
        entryIds: z.array(z.number().int()).min(1).max(100).describe('Array of file entry IDs to delete (max 100 per call).'),
        workspaceId: z.number().int().default(0).describe('Workspace ID. Use 0 for personal workspace.'),
      },
    },
    async (params) => {
      const blocked = requireWriteAccess(readOnly);
      if (blocked) return textResult(blocked, true);

      try {
        await client.deleteEntries(params.entryIds, params.workspaceId);
        const count = params.entryIds.length;
        return textResult(`Moved ${count} ${count === 1 ? 'entry' : 'entries'} to trash (IDs: ${params.entryIds.join(', ')}).`);
      } catch (err) {
        return textResult(formatError(err), true);
      }
    },
  );
}

// ---- drime_move_files ----

export function registerMoveFilesTool(server: McpServer, client: DrimeClient, readOnly: boolean) {
  server.registerTool(
    'drime_move_files',
    {
      description: 'Move files or folders to a different location in Drime Cloud.',
      inputSchema: {
        entryIds: z.array(z.number().int()).min(1).max(100).describe('Array of file entry IDs to move (max 100 per call).'),
        targetFolderId: z.number().int().nullable().describe('ID of the destination folder. Use null to move to root.'),
        workspaceId: z.number().int().default(0).describe('Workspace ID. Use 0 for personal workspace.'),
      },
    },
    async (params) => {
      const blocked = requireWriteAccess(readOnly);
      if (blocked) return textResult(blocked, true);

      try {
        await client.moveEntries(params.entryIds, params.targetFolderId, params.workspaceId);
        const count = params.entryIds.length;
        const target = params.targetFolderId ?? 'root';
        return textResult(`Moved ${count} ${count === 1 ? 'entry' : 'entries'} to folder ID ${target}.`);
      } catch (err) {
        return textResult(formatError(err), true);
      }
    },
  );
}
