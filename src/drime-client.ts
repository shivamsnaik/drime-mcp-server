import type {
  DrimeUser,
  FileEntry,
  FolderInfo,
  GetUserResponse,
  ListFileEntriesParams,
  PaginatedResponse,
  SpaceUsage,
  UploadFileResponse,
  Workspace,
  CreateFolderResponse,
} from './types.js';

const BASE_URL = 'https://app.drime.cloud/api/v1';

const REQUEST_TIMEOUT_MS = 30_000;

export class DrimeApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: Record<string, string>,
  ) {
    super(message);
    this.name = 'DrimeApiError';
  }
}

export interface DrimeClientConfig {
  token: string;
  baseUrl?: string;
}

export class DrimeClient {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(config: DrimeClientConfig) {
    if (!config.token) {
      throw new Error('Drime API token is required. Set DRIME_API_TOKEN environment variable.');
    }
    // Prevent HTTP header injection via CRLF in the token
    if (/[\r\n]/.test(config.token)) {
      throw new Error('Drime API token contains invalid characters (CRLF).');
    }
    this.token = config.token;
    this.baseUrl = config.baseUrl ?? BASE_URL;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
    };
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined | Array<number>>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const v of value) {
            url.searchParams.append(`${key}[]`, String(v));
          }
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async request<T>(method: string, path: string, options?: {
    params?: Record<string, string | number | boolean | undefined | Array<number>>;
    body?: unknown;
    formData?: FormData;
    rawResponse?: boolean;
  }): Promise<T> {
    const url = this.buildUrl(path, options?.params);

    const headers: Record<string, string> = { ...this.headers };
    let body: string | FormData | undefined;

    if (options?.formData) {
      body = options.formData;
      // Don't set Content-Type for FormData — the browser/Node sets it with boundary
    } else if (options?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (options?.rawResponse) {
      if (!response.ok) {
        throw new DrimeApiError(
          `Download failed with status ${response.status}`,
          response.status,
        );
      }
      return response as unknown as T;
    }

    const text = await response.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new DrimeApiError(
        `Unexpected response (status ${response.status}): ${text.slice(0, 200)}`,
        response.status,
      );
    }

    if (!response.ok) {
      const err = json as { message?: string; errors?: Record<string, string> };
      throw new DrimeApiError(
        err.message ?? `Request failed with status ${response.status}`,
        response.status,
        err.errors,
      );
    }

    return json as T;
  }

  // ---- User ----

  async getLoggedUser(): Promise<DrimeUser> {
    const res = await this.request<GetUserResponse>('GET', '/users/me');
    return res.user;
  }

  async getWorkspaces(): Promise<Workspace[]> {
    const res = await this.request<{ workspaces: Workspace[] }>('GET', '/me/workspaces');
    return res.workspaces;
  }

  async getSpaceUsage(workspaceId: number = 0): Promise<SpaceUsage> {
    const res = await this.request<{ used: number; available: number }>('GET', '/user/space-usage', {
      params: { workspaceId },
    });
    return { used: res.used, total: res.used + res.available, used_percentage: res.available > 0 ? (res.used / (res.used + res.available)) * 100 : 0 };
  }

  // ---- Files & Folders ----

  async listFileEntries(params: ListFileEntriesParams = {}): Promise<PaginatedResponse<FileEntry>> {
    return this.request<PaginatedResponse<FileEntry>>('GET', '/drive/file-entries', {
      params: {
        workspaceId: params.workspaceId ?? 0,
        perPage: params.perPage ?? 50,
        page: params.page ?? 1,
        parentIds: params.parentIds,
        folderId: params.folderId,
        query: params.query,
        type: params.type,
        deletedOnly: params.deletedOnly,
        starredOnly: params.starredOnly,
        recentOnly: params.recentOnly,
        sharedOnly: params.sharedOnly,
        orderBy: params.orderBy,
        orderDir: params.orderDir,
      },
    });
  }

  async getFileEntry(entryId: number, workspaceId: number = 0): Promise<FileEntry> {
    const res = await this.request<{ fileEntry: FileEntry }>('GET', `/file-entries/${encodeURIComponent(String(entryId))}`, {
      params: { workspaceId },
    });
    return res.fileEntry;
  }

  async createFolder(name: string, parentId: number | null = null, workspaceId: number = 0): Promise<FileEntry> {
    const res = await this.request<CreateFolderResponse>('POST', '/drive/file-entries/folders', {
      params: { workspaceId },
      body: { name, parentId },
    });
    return res.data;
  }

  async deleteEntries(entryIds: number[], workspaceId: number = 0): Promise<void> {
    await this.request('DELETE', '/drive/file-entries', {
      params: { workspaceId },
      body: { entryIds },
    });
  }

  async moveEntries(entryIds: number[], targetFolderId: number | null, workspaceId: number = 0): Promise<void> {
    await this.request('POST', '/drive/file-entries/move', {
      params: { workspaceId },
      body: { entryIds, targetFolderId },
    });
  }

  async getUserFolders(workspaceId: number = 0): Promise<FolderInfo[]> {
    const user = await this.getLoggedUser();
    const res = await this.request<{ folders: FolderInfo[] }>('GET', `/users/${user.id}/folders`, {
      params: { workspaceId },
    });
    return res.folders;
  }

  // ---- Download ----

  async downloadFile(hash: string): Promise<Response> {
    return this.request<Response>('GET', `/file-entries/download/${encodeURIComponent(hash)}`, {
      rawResponse: true,
    });
  }

  // ---- Upload ----

  async uploadFile(params: {
    file: Blob | Uint8Array;
    fileName: string;
    parentId?: number | null;
    workspaceId?: number;
    relativePath?: string;
    lastModified?: number;
    fileHash?: string;
  }): Promise<FileEntry> {
    const formData = new FormData();

    // Convert Uint8Array to Blob if needed
    const fileBlob = params.file instanceof Blob
      ? params.file
      : new Blob([new Uint8Array(params.file)]);

    formData.append('file', fileBlob, params.fileName);
    formData.append('parentId', params.parentId != null ? String(params.parentId) : '');
    formData.append('workspaceId', String(params.workspaceId ?? 0));
    if (params.relativePath) {
      formData.append('relativePath', params.relativePath);
    }
    if (params.lastModified != null) {
      formData.append('lastModified', String(params.lastModified));
    }
    if (params.fileHash) {
      formData.append('fileHash', params.fileHash);
    }

    const res = await this.request<UploadFileResponse>('POST', '/uploads', {
      formData,
    });
    return res.fileEntry;
  }
}
