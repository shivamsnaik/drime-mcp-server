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

// MIME types that can be safely returned as text
const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'text/css',
  'text/javascript',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'application/x-yaml',
  'application/yaml',
  'application/toml',
  'application/sql',
  'application/x-sh',
  'application/x-python',
  'image/svg+xml',
]);

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'json', 'xml', 'html', 'htm', 'css',
  'js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp',
  'h', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'yaml', 'yml', 'toml',
  'ini', 'cfg', 'conf', 'sql', 'graphql', 'gql', 'svg', 'env', 'gitignore',
  'dockerfile', 'makefile', 'log', 'diff', 'patch',
]);

const MAX_TEXT_SIZE = 5 * 1024 * 1024; // 5 MB — refuse to read larger files as text

// ---- drime_read_file ----

export function registerReadFileTool(server: McpServer, client: DrimeClient) {
  server.registerTool(
    'drime_read_file',
    {
      description: 'Download and read the content of a text-based file from Drime Cloud (supports txt, md, json, csv, code files, etc.). For binary files (images, videos, PDFs), use drime_get_file_info to get metadata instead.',
      inputSchema: {
        hash: z.string().regex(/^[A-Za-z0-9+/=]+$/, 'Must be a valid Drime file hash (base64 characters only).').describe('The file entry hash (e.g., "MzI2MHxwYWRkaQ"). Get this from drime_list_files or drime_search_files.'),
      },
    },
    async ({ hash }) => {
      try {
        const response = await client.downloadFile(hash);

        const contentType = response.headers.get('content-type') ?? '';
        const disposition = response.headers.get('content-disposition') ?? '';
        const filename = disposition.match(/filename="?([^";]+)"?/)?.[1] ?? 'unknown';
        const contentLength = Number(response.headers.get('content-length') ?? 0);

        // Check if this is likely a text file
        const ext = filename.split('.').pop()?.toLowerCase() ?? '';
        const isText = TEXT_MIME_TYPES.has(contentType.split(';')[0].trim()) || TEXT_EXTENSIONS.has(ext);

        if (!isText) {
          return textResult(
            `File "${filename}" appears to be binary (${contentType || 'unknown type'}, ${contentLength} bytes). ` +
            `Use drime_get_file_info for metadata, or download it externally.`,
            true,
          );
        }

        if (contentLength > MAX_TEXT_SIZE) {
          return textResult(
            `File "${filename}" is too large to read as text (${contentLength} bytes, limit is ${MAX_TEXT_SIZE} bytes).`,
            true,
          );
        }

        const text = await response.text();

        // Content-Length can be missing or understated — enforce the limit on actual content
        if (text.length > MAX_TEXT_SIZE) {
          return textResult(
            `File "${filename}" is too large to read as text (${text.length} chars, limit is ${MAX_TEXT_SIZE}).`,
            true,
          );
        }

        return textResult(`File: ${filename} (${contentType})\n\n${text}`);
      } catch (err) {
        return textResult(formatError(err), true);
      }
    },
  );
}
