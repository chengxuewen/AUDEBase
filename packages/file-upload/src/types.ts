/**
 * @audebase/file-upload - Type definitions
 */

/** Attachment record stored in the database. */
export interface AttachmentRecord {
  /** UUID v4 */
  id: string
  /** Multi-tenant isolation key */
  tenantId: string
  /** Original filename as provided by the uploader */
  filename: string
  /** MIME type detected via magic bytes */
  contentType: string
  /** File size in bytes */
  size: number
  /** SHA-256 hash hex string */
  sha256: string
  /** Storage backend identifier (Phase 1b: 'local' only) */
  storageBackend: 'local'
  /** Relative path within the storage root */
  storagePath: string
  /** Uploading user ID */
  uploadedBy: string
  /** Creation timestamp */
  createdAt: Date
  /** Soft-delete timestamp (null = not deleted) */
  deletedAt: Date | null
}

/** Input file for upload. */
export interface FileUpload {
  /** Original filename */
  filename: string
  /** MIME type from the client (untrusted, used for logging only) */
  mimeType: string
  /** File data */
  data: Buffer
  /** File size in bytes */
  size: number
}

/** Filter options for listing attachments. */
export interface FileFilter {
  page?: number
  pageSize?: number
  /** Filter by MIME type prefix (e.g. 'image/') */
  contentType?: string
  /** Fuzzy match on original filename */
  filename?: string
}

/** Constructor options for FileUploadService. */
export interface FileUploadOptions {
  /** Root directory for local file storage */
  storageDir: string
  /** Maximum file size in bytes (default: 20MB) */
  maxFileSize?: number
  /** Allowed MIME types whitelist */
  allowedMimeTypes?: string[]
}

/** Download result containing file data and metadata. */
export interface DownloadResult {
  data: Buffer
  name: string
  mimeType: string
  record: AttachmentRecord
}

/** List result with data and pagination metadata. */
export interface ListResult {
  data: AttachmentRecord[]
  total: number
  page: number
  pageSize: number
}

/**
 * Abstract database provider for attachment records.
 * Implementations inject a real Drizzle connection; tests use an in-memory mock.
 */
export interface AttachmentRepository {
  insert(record: AttachmentRecord): Promise<void>
  findById(
    id: string,
    tenantId: string,
  ): Promise<AttachmentRecord | null>
  list(
    tenantId: string,
    filter?: FileFilter,
  ): Promise<{ records: AttachmentRecord[]; total: number }>
  softDelete(id: string, tenantId: string): Promise<boolean>
}
