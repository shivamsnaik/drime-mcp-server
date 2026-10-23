import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DrimeClient, DrimeApiError } from '../src/drime-client.js';

// Helper to create a mock fetch response
function mockResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const status = init.status ?? 200;
  const headers = new Headers(init.headers ?? {});
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    json: () => Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body),
    blob: () => Promise.resolve(new Blob([typeof body === 'string' ? body : JSON.stringify(body)])),
  } as Response;
}

describe('DrimeClient', () => {
  let client: DrimeClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = new DrimeClient({ token: 'test-token-123' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('should throw if token is empty', () => {
      expect(() => new DrimeClient({ token: '' })).toThrow('Drime API token is required');
    });

    it('should accept a valid token', () => {
      expect(() => new DrimeClient({ token: 'abc' })).not.toThrow();
    });

    it('should reject tokens containing CRLF (header injection)', () => {
      expect(() => new DrimeClient({ token: 'abc\r\nX-Injected: true' })).toThrow('invalid characters');
      expect(() => new DrimeClient({ token: 'abc\nInjected' })).toThrow('invalid characters');
      expect(() => new DrimeClient({ token: 'abc\rInjected' })).toThrow('invalid characters');
    });
  });

  describe('getLoggedUser', () => {
    it('should call /users/me with auth header', async () => {
      fetchMock.mockResolvedValue(mockResponse({
        user: { id: 1, email: 'test@example.com', display_name: 'Test', first_name: 'Test', last_name: 'User', created_at: '', updated_at: '' },
        status: 'success',
      }));

      const user = await client.getLoggedUser();

      expect(user.email).toBe('test@example.com');
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('/users/me');
      expect(init.headers.Authorization).toBe('Bearer test-token-123');
    });

    it('should throw DrimeApiError on 401', async () => {
      fetchMock.mockResolvedValue(mockResponse(
        { message: 'Authentication required.' },
        { status: 401 },
      ));

      await expect(client.getLoggedUser()).rejects.toThrow(DrimeApiError);
      await expect(client.getLoggedUser()).rejects.toThrow('Authentication required.');
    });
  });

  describe('listFileEntries', () => {
    it('should call /drive/file-entries with query params', async () => {
      fetchMock.mockResolvedValue(mockResponse({
        data: [],
        folder: null,
        current_page: 1,
        last_page: 1,
        per_page: 50,
        total: 0,
        from: 0,
        to: 0,
      }));

      await client.listFileEntries({ workspaceId: 0, perPage: 10, query: 'test' });

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('/drive/file-entries');
      expect(url).toContain('workspaceId=0');
      expect(url).toContain('perPage=10');
      expect(url).toContain('query=test');
    });

    it('should use defaults when no params provided', async () => {
      fetchMock.mockResolvedValue(mockResponse({
        data: [], folder: null, current_page: 1, last_page: 1, per_page: 50, total: 0, from: 0, to: 0,
      }));

      await client.listFileEntries();

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('workspaceId=0');
      expect(url).toContain('perPage=50');
      expect(url).toContain('page=1');
    });

    it('should properly encode query parameters with special characters', async () => {
      fetchMock.mockResolvedValue(mockResponse({
        data: [], folder: null, current_page: 1, last_page: 1, per_page: 50, total: 0, from: 0, to: 0,
      }));

      await client.listFileEntries({ query: 'a&b=c#d' });

      const [url] = fetchMock.mock.calls[0];
      // Special chars must be percent-encoded, not break the query string
      expect(url).toContain('query=a%26b%3Dc%23d');
      // Only one query parameter should exist (no injection of extra params)
      const parsed = new URL(url);
      expect(parsed.searchParams.get('query')).toBe('a&b=c#d');
      expect([...parsed.searchParams.keys()].filter(k => k !== 'query' && !['workspaceId', 'perPage', 'page'].includes(k))).toHaveLength(0);
    });
  });

  describe('getFileEntry', () => {
    it('should call /file-entries/{id}', async () => {
      fetchMock.mockResolvedValue(mockResponse({
        fileEntry: { id: 42, name: 'test.txt', type: 'text', hash: 'abc', file_size: 100, parent_id: null, workspace_id: 0, created_at: '', updated_at: '' },
      }));

      const entry = await client.getFileEntry(42);

      expect(entry.id).toBe(42);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('/file-entries/42');
    });
  });

  describe('createFolder', () => {
    it('should POST to /drive/file-entries/folders', async () => {
      fetchMock.mockResolvedValue(mockResponse(
        { status: 'success', data: { id: 99, name: 'New Folder', type: 'folder', hash: 'xyz', file_size: 0, parent_id: null, workspace_id: 0, created_at: '', updated_at: '' } },
        { status: 201 },
      ));

      const folder = await client.createFolder('New Folder', null, 0);

      expect(folder.name).toBe('New Folder');
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('/drive/file-entries/folders');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ name: 'New Folder', parentId: null });
    });
  });

  describe('deleteEntries', () => {
    it('should DELETE /drive/file-entries with entry IDs', async () => {
      fetchMock.mockResolvedValue(mockResponse({ status: 'success' }));

      await client.deleteEntries([1, 2, 3]);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('/drive/file-entries');
      expect(init.method).toBe('DELETE');
      expect(JSON.parse(init.body)).toEqual({ entryIds: [1, 2, 3] });
    });
  });

  describe('downloadFile', () => {
    it('should call /file-entries/download/{hash}', async () => {
      fetchMock.mockResolvedValue(mockResponse('file content', {
        headers: { 'content-type': 'text/plain', 'content-disposition': 'attachment; filename="test.txt"' },
      }));

      const response = await client.downloadFile('abc123');

      expect(response.ok).toBe(true);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('/file-entries/download/abc123');
    });

    it('should URL-encode path traversal attempts in hash', async () => {
      fetchMock.mockResolvedValue(mockResponse('file content', {
        headers: { 'content-type': 'text/plain' },
      }));

      await client.downloadFile('../../users/me');

      const [url] = fetchMock.mock.calls[0];
      // The ../ should be percent-encoded, not resolved as a path segment
      expect(url).toContain('/file-entries/download/..%2F..%2Fusers%2Fme');
      // Should NOT resolve to a different endpoint
      expect(url).not.toMatch(/\/users\/me$/);
    });

    it('should URL-encode slashes in base64 hashes', async () => {
      fetchMock.mockResolvedValue(mockResponse('file content', {
        headers: { 'content-type': 'text/plain' },
      }));

      await client.downloadFile('abc/def+ghi=');

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('/file-entries/download/abc%2Fdef%2Bghi%3D');
    });

    it('should URL-encode query-string injection attempts in hash', async () => {
      fetchMock.mockResolvedValue(mockResponse('file content', {
        headers: { 'content-type': 'text/plain' },
      }));

      await client.downloadFile('abc?admin=true#fragment');

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('/file-entries/download/abc%3Fadmin%3Dtrue%23fragment');
    });
  });

  describe('uploadFile', () => {
    it('should POST multipart form data to /uploads', async () => {
      fetchMock.mockResolvedValue(mockResponse(
        {
          status: 'success',
          fileEntry: { id: 1, name: 'doc.txt', type: 'text', hash: 'h', file_size: 5, parent_id: null, workspace_id: 0, created_at: '', updated_at: '' },
        },
        { status: 201 },
      ));

      const entry = await client.uploadFile({
        file: new Uint8Array([72, 101, 108, 108, 111]), // "Hello"
        fileName: 'doc.txt',
        workspaceId: 0,
      });

      expect(entry.name).toBe('doc.txt');
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('/uploads');
      expect(init.method).toBe('POST');
      expect(init.body).toBeInstanceOf(FormData);
    });
  });

  describe('error handling', () => {
    it('should throw DrimeApiError with status code and message', async () => {
      fetchMock.mockResolvedValue(mockResponse(
        { status: 'error', message: 'Not found', errors: { id: 'Entry not found' } },
        { status: 404 },
      ));

      try {
        await client.getFileEntry(999);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DrimeApiError);
        expect((err as DrimeApiError).statusCode).toBe(404);
        expect((err as DrimeApiError).message).toBe('Not found');
        expect((err as DrimeApiError).details).toEqual({ id: 'Entry not found' });
      }
    });

    it('should handle non-JSON error responses', async () => {
      fetchMock.mockResolvedValue(mockResponse('<html>Server Error</html>', { status: 500 }));

      await expect(client.getLoggedUser()).rejects.toThrow(DrimeApiError);
    });
  });

  describe('getWorkspaces', () => {
    it('should call /me/workspaces', async () => {
      fetchMock.mockResolvedValue(mockResponse({
        workspaces: [{ id: 0, name: 'Personal', created_at: '', updated_at: '' }],
      }));

      const workspaces = await client.getWorkspaces();
      expect(workspaces).toHaveLength(1);
      expect(workspaces[0].name).toBe('Personal');
    });
  });

  describe('getSpaceUsage', () => {
    it('should call /user/space-usage with workspaceId', async () => {
      fetchMock.mockResolvedValue(mockResponse({
        used: 1024,
        available: 9216,
      }));

      const usage = await client.getSpaceUsage(0);
      expect(usage.used).toBe(1024);

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('/user/space-usage');
      expect(url).toContain('workspaceId=0');
    });
  });
});
