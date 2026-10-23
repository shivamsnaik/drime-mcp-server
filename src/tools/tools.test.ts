import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DrimeClient } from '../drime-client.js';
import { registerAllTools } from './index.js';

// Capture registered tools
interface RegisteredTool {
  name: string;
  description: string;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

function createMockServer(): { server: McpServer; tools: Map<string, RegisteredTool> } {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    registerTool(name: string, config: { description?: string; inputSchema?: Record<string, unknown> }, handler: (params: Record<string, unknown>) => Promise<unknown>) {
      tools.set(name, { name, description: config.description ?? '', handler });
    },
  } as unknown as McpServer;
  return { server, tools };
}

function mockResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(init.headers ?? {}),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    json: () => Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body),
    blob: () => Promise.resolve(new Blob([typeof body === 'string' ? body : JSON.stringify(body)])),
  } as Response;
}

describe('MCP Tools', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: DrimeClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = new DrimeClient({ token: 'test-token' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('tool registration', () => {
    it('should register all 11 tools in read-write mode', () => {
      const { server, tools } = createMockServer();
      registerAllTools(server, client, false);

      const expectedTools = [
        'drime_get_user',
        'drime_list_workspaces',
        'drime_get_space_usage',
        'drime_list_files',
        'drime_search_files',
        'drime_get_file_info',
        'drime_get_folders',
        'drime_read_file',
        'drime_upload_file',
        'drime_create_folder',
        'drime_delete_files',
        'drime_move_files',
      ];

      for (const name of expectedTools) {
        expect(tools.has(name), `Tool ${name} should be registered`).toBe(true);
      }
      expect(tools.size).toBe(expectedTools.length);
    });

    it('should register all tools in read-only mode too (they check at runtime)', () => {
      const { server, tools } = createMockServer();
      registerAllTools(server, client, true);
      expect(tools.size).toBe(12);
    });
  });

  describe('drime_get_user', () => {
    it('should return user info as JSON text', async () => {
      fetchMock.mockResolvedValue(mockResponse({
        user: { id: 1, email: 'a@b.com', display_name: 'Alice', first_name: 'Alice', last_name: 'Smith', created_at: '', updated_at: '' },
        status: 'success',
      }));

      const { server, tools } = createMockServer();
      registerAllTools(server, client, false);
      const result = await tools.get('drime_get_user')!.handler({}) as { content: Array<{ type: string; text: string }> };

      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.email).toBe('a@b.com');
    });

    it('should return error result on API failure', async () => {
      fetchMock.mockResolvedValue(mockResponse({ message: 'Auth required' }, { status: 401 }));

      const { server, tools } = createMockServer();
      registerAllTools(server, client, false);
      const result = await tools.get('drime_get_user')!.handler({}) as { content: Array<{ text: string }>; isError: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('401');
    });
  });

  describe('drime_list_files', () => {
    it('should format file entries nicely', async () => {
      fetchMock.mockResolvedValue(mockResponse({
        data: [
          { id: 1, name: 'Documents', type: 'folder', hash: 'h1', file_size: 0, parent_id: null, workspace_id: 0, created_at: '', updated_at: '2024-01-01' },
          { id: 2, name: 'photo.jpg', type: 'image', hash: 'h2', file_size: 2048576, mime: 'image/jpeg', extension: 'jpg', parent_id: null, workspace_id: 0, created_at: '', updated_at: '2024-01-02' },
        ],
        folder: null,
        current_page: 1, last_page: 1, per_page: 50, total: 2, from: 1, to: 2,
      }));

      const { server, tools } = createMockServer();
      registerAllTools(server, client, false);
      const result = await tools.get('drime_list_files')!.handler({
        workspaceId: 0, orderBy: 'name', orderDir: 'asc', perPage: 50, page: 1,
      }) as { content: Array<{ text: string }> };

      const text = result.content[0].text;
      expect(text).toContain('Root directory');
      expect(text).toContain('[DIR] Documents');
      expect(text).toContain('[FILE] photo.jpg');
      expect(text).toContain('2.0 MB');
    });

    it('should show folder name when browsing inside a folder', async () => {
      fetchMock.mockResolvedValue(mockResponse({
        data: [],
        folder: { id: 5, name: 'Projects', hash: 'h5', parent_id: null, workspace_id: 0 },
        current_page: 1, last_page: 1, per_page: 50, total: 0, from: 0, to: 0,
      }));

      const { server, tools } = createMockServer();
      registerAllTools(server, client, false);
      const result = await tools.get('drime_list_files')!.handler({
        folderId: 'h5', workspaceId: 0, orderBy: 'name', orderDir: 'asc', perPage: 50, page: 1,
      }) as { content: Array<{ text: string }> };

      expect(result.content[0].text).toContain('Folder: Projects');
      expect(result.content[0].text).toContain('(empty)');
    });
  });

  describe('drime_search_files', () => {
    it('should include search query in header', async () => {
      fetchMock.mockResolvedValue(mockResponse({
        data: [{ id: 1, name: 'report.pdf', type: 'pdf', hash: 'h', file_size: 1024, mime: 'application/pdf', extension: 'pdf', parent_id: null, workspace_id: 0, created_at: '', updated_at: '' }],
        folder: null,
        current_page: 1, last_page: 1, per_page: 50, total: 1, from: 1, to: 1,
      }));

      const { server, tools } = createMockServer();
      registerAllTools(server, client, false);
      const result = await tools.get('drime_search_files')!.handler({
        query: 'report', workspaceId: 0, perPage: 50, page: 1,
      }) as { content: Array<{ text: string }> };

      expect(result.content[0].text).toContain('Search results for "report"');
      expect(result.content[0].text).toContain('report.pdf');
    });
  });

  describe('drime_read_file', () => {
    it('should return text file content', async () => {
      fetchMock.mockResolvedValue(mockResponse('Hello World', {
        headers: { 'content-type': 'text/plain', 'content-disposition': 'attachment; filename="hello.txt"' },
      }));

      const { server, tools } = createMockServer();
      registerAllTools(server, client, false);
      const result = await tools.get('drime_read_file')!.handler({ hash: 'abc' }) as { content: Array<{ text: string }> };

      expect(result.content[0].text).toContain('File: hello.txt');
      expect(result.content[0].text).toContain('Hello World');
    });

    it('should reject binary files', async () => {
      fetchMock.mockResolvedValue(mockResponse('binary', {
        headers: { 'content-type': 'image/jpeg', 'content-disposition': 'attachment; filename="photo.jpg"', 'content-length': '1000' },
      }));

      const { server, tools } = createMockServer();
      registerAllTools(server, client, false);
      const result = await tools.get('drime_read_file')!.handler({ hash: 'abc' }) as { content: Array<{ text: string }>; isError: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('binary');
    });
  });

  describe('write tools in read-only mode', () => {
    it('drime_upload_file should be blocked', async () => {
      const { server, tools } = createMockServer();
      registerAllTools(server, client, true);
      const result = await tools.get('drime_upload_file')!.handler({
        fileName: 'test.txt', contentBase64: 'SGVsbG8=', workspaceId: 0,
      }) as { content: Array<{ text: string }>; isError: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('read-only');
    });

    it('drime_create_folder should be blocked', async () => {
      const { server, tools } = createMockServer();
      registerAllTools(server, client, true);
      const result = await tools.get('drime_create_folder')!.handler({
        name: 'New', workspaceId: 0,
      }) as { content: Array<{ text: string }>; isError: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('read-only');
    });

    it('drime_delete_files should be blocked', async () => {
      const { server, tools } = createMockServer();
      registerAllTools(server, client, true);
      const result = await tools.get('drime_delete_files')!.handler({
        entryIds: [1, 2], workspaceId: 0,
      }) as { content: Array<{ text: string }>; isError: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('read-only');
    });

    it('drime_move_files should be blocked', async () => {
      const { server, tools } = createMockServer();
      registerAllTools(server, client, true);
      const result = await tools.get('drime_move_files')!.handler({
        entryIds: [1], targetFolderId: null, workspaceId: 0,
      }) as { content: Array<{ text: string }>; isError: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('read-only');
    });
  });

  describe('drime_upload_file input validation', () => {
    it('should reject oversized content', async () => {
      const { server, tools } = createMockServer();
      registerAllTools(server, client, false);
      // ~7MB of base64 (decodes to > 5MB)
      const big = 'A'.repeat(7 * 1024 * 1024);
      const result = await tools.get('drime_upload_file')!.handler({
        fileName: 'big.bin', contentBase64: big, workspaceId: 0,
      }) as { content: Array<{ text: string }>; isError: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('too large');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should reject empty content', async () => {
      const { server, tools } = createMockServer();
      registerAllTools(server, client, false);
      const result = await tools.get('drime_upload_file')!.handler({
        fileName: 'empty.txt', contentBase64: '', workspaceId: 0,
      }) as { content: Array<{ text: string }>; isError: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('empty');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should reject filenames with path traversal', async () => {
      const { server, tools } = createMockServer();
      registerAllTools(server, client, false);
      const result = await tools.get('drime_upload_file')!.handler({
        fileName: '../../etc/passwd', contentBase64: 'SGVsbG8=', workspaceId: 0,
      }) as { content: Array<{ text: string }>; isError: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid fileName');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should reject filenames with path separators', async () => {
      const { server, tools } = createMockServer();
      registerAllTools(server, client, false);
      const result = await tools.get('drime_upload_file')!.handler({
        fileName: 'folder/file.txt', contentBase64: 'SGVsbG8=', workspaceId: 0,
      }) as { content: Array<{ text: string }>; isError: boolean };

      expect(result.isError).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should reject relativePath with traversal', async () => {
      const { server, tools } = createMockServer();
      registerAllTools(server, client, false);
      const result = await tools.get('drime_upload_file')!.handler({
        fileName: 'file.txt', contentBase64: 'SGVsbG8=', workspaceId: 0,
        relativePath: '/../../etc',
      }) as { content: Array<{ text: string }>; isError: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('relativePath');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('write tools in read-write mode', () => {
    it('drime_upload_file should upload successfully', async () => {
      fetchMock.mockResolvedValue(mockResponse(
        { status: 'success', fileEntry: { id: 1, name: 'test.txt', type: 'text', hash: 'h', file_size: 5, parent_id: null, workspace_id: 0, created_at: '', updated_at: '' } },
        { status: 201 },
      ));

      const { server, tools } = createMockServer();
      registerAllTools(server, client, false);
      const result = await tools.get('drime_upload_file')!.handler({
        fileName: 'test.txt', contentBase64: 'SGVsbG8=', workspaceId: 0,
      }) as { content: Array<{ text: string }> };

      expect(result.content[0].text).toContain('Uploaded "test.txt" successfully');
    });

    it('drime_create_folder should create successfully', async () => {
      fetchMock.mockResolvedValue(mockResponse(
        { status: 'success', data: { id: 99, name: 'NewFolder', type: 'folder', hash: 'h99', file_size: 0, parent_id: null, workspace_id: 0, created_at: '', updated_at: '' } },
        { status: 201 },
      ));

      const { server, tools } = createMockServer();
      registerAllTools(server, client, false);
      const result = await tools.get('drime_create_folder')!.handler({
        name: 'NewFolder', workspaceId: 0,
      }) as { content: Array<{ text: string }> };

      expect(result.content[0].text).toContain('Created folder "NewFolder"');
    });

    it('drime_delete_files should delete successfully', async () => {
      fetchMock.mockResolvedValue(mockResponse({ status: 'success' }));

      const { server, tools } = createMockServer();
      registerAllTools(server, client, false);
      const result = await tools.get('drime_delete_files')!.handler({
        entryIds: [1, 2], workspaceId: 0,
      }) as { content: Array<{ text: string }> };

      expect(result.content[0].text).toContain('Moved 2 entries to trash');
    });
  });

  describe('read tools in read-only mode (should work)', () => {
    it('drime_list_files should work in read-only mode', async () => {
      fetchMock.mockResolvedValue(mockResponse({
        data: [], folder: null, current_page: 1, last_page: 1, per_page: 50, total: 0, from: 0, to: 0,
      }));

      const { server, tools } = createMockServer();
      registerAllTools(server, client, true);
      const result = await tools.get('drime_list_files')!.handler({
        workspaceId: 0, orderBy: 'name', orderDir: 'asc', perPage: 50, page: 1,
      }) as { content: Array<{ text: string }>; isError?: boolean };

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Root directory');
    });
  });
});
