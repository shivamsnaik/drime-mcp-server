// Drime Cloud API types
// Based on https://docs.drime.cloud

export interface DrimeUser {
  id: number;
  email: string;
  display_name: string;
  first_name: string;
  last_name: string;
  created_at: string;
  updated_at: string;
}

export type FileType = 'folder' | 'image' | 'text' | 'audio' | 'video' | 'pdf' | string;

export interface FileEntry {
  id: number;
  name: string;
  type: FileType;
  hash: string;
  file_size: number;
  mime?: string;
  extension?: string;
  parent_id: number | null;
  workspace_id: number;
  path?: string;
  created_at: string;
  updated_at: string;
  client_last_modified?: number;
}

export interface FolderInfo {
  id: number;
  name: string;
  hash: string;
  parent_id: number | null;
  workspace_id: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  folder: FolderInfo | null;
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number;
  to: number;
}

export interface ListFileEntriesParams {
  workspaceId?: number;
  perPage?: number;
  page?: number;
  parentIds?: number[];
  folderId?: string;
  query?: string;
  type?: FileType;
  deletedOnly?: boolean;
  starredOnly?: boolean;
  recentOnly?: boolean;
  sharedOnly?: boolean;
  orderBy?: 'updated_at' | 'created_at' | 'name' | 'file_size';
  orderDir?: 'asc' | 'desc';
}

export interface Workspace {
  id: number;
  name: string;
  role?: string;
  file_count?: number;
  total_size?: number;
  created_at: string;
  updated_at: string;
}

export interface SpaceUsage {
  used: number;
  total: number;
  used_percentage: number;
}

export interface ShareableLink {
  id: number;
  hash: string;
  url: string;
  permissions: string;
  expires_at: string | null;
  created_at: string;
}

export interface DrimeApiError {
  status: 'error';
  message: string;
  errors?: Record<string, string>;
}

export interface DrimeApiSuccess<T> {
  status: 'success';
  data?: T;
}

// Response wrappers from the API
export interface GetUserResponse {
  user: DrimeUser;
  status: string;
}

export interface UploadFileResponse {
  status: string;
  fileEntry: FileEntry;
}

export interface CreateFolderResponse {
  status: string;
  data: FileEntry;
}
