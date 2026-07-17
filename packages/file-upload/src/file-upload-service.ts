/**
 * @audebase/file-upload - FileUploadService
 *
 * Phase 1b: local filesystem storage with magic-byte validation,
 * path-traversal prevention, tenant isolation, and SHA-256 hashing.
 */

import { randomUUID, createHash } from 'node:crypto'
import { mkdir, writeFile, readFile, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'

import { UserError } from '@audebase/shared-types'

import {
  DEFAULT_MAX_FILE_SIZE,
  HARD_MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  MAGIC_BYTES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './constants.js'
import type {
  AttachmentRecord,
  FileUpload,
  FileFilter,
  FileUploadOptions,
  DownloadResult,
  ListResult,
  AttachmentRepository,
} from './types.js'

/**
 * MIME-to-extension map for storage filename derivation.
 * Extensions are derived from detected MIME, never from user input.
 */
const MIME_TO_EXT: Readonly<Record<string, string>> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
}

/**
 * Detect MIME type from file magic bytes.
 * For OOXML (zip-based) formats, disambiguate xlsx vs docx using filename extension.
 * Returns the detected MIME or null if no signature matches.
 */
function detectMimeType(data: Buffer, filename: string): string | null {
  const hex = data.subarray(0, 8).toString('hex')
  // Check non-zip signatures first
  for (const sig of MAGIC_BYTES) {
    if (sig.hex === '504b0304') continue
    if (hex.startsWith(sig.hex)) {
      return sig.mime
    }
  }
  // OOXML zip - disambiguate by filename extension
  if (hex.startsWith('504b0304')) {
    const lower = filename.toLowerCase()
    if (lower.endsWith('.docx')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
    if (lower.endsWith('.xlsx')) {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
    // Default to xlsx for unknown zip extensions
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  return null
}

/**
 * Sanitise a user-provided filename: strip path components, control chars.
 * Returns a clean basename or 'unnamed' if empty.
 */
function sanitizeFilename(name: string): string {
  // Strip directory components
  const basename = name.replace(/[/\\]/g, '').replace(/\.\./g, '')
  // Remove control characters
  const cleaned = basename.replace(/[\u0000-\u001F]/g, '')
  return cleaned.length > 0 ? cleaned : 'unnamed'
}

/**
 * File upload service — local filesystem backend.
 *
 * Files are stored at `{storageDir}/{tenantId}/{sha256[:2]}/{sha256}`
 * using the content hash as the filename (dedup-ready, path-safe).
 */
export class FileUploadService {
  private readonly storageDir: string
  private readonly maxFileSize: number
  private readonly allowedMimeTypes: Set<string>
  private readonly repo: AttachmentRepository

  constructor(repo: AttachmentRepository, options: FileUploadOptions) {
    this.repo = repo
    this.storageDir = options.storageDir
    const configured = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE
    this.maxFileSize = Math.min(configured, HARD_MAX_FILE_SIZE)
    this.allowedMimeTypes = new Set(
      options.allowedMimeTypes ?? ALLOWED_MIME_TYPES,
    )
  }

  /**
   * Upload a file: validate, hash, write to disk, persist metadata.
   */
  async upload(
    file: FileUpload,
    tenantId: string,
    userId: string,
  ): Promise<AttachmentRecord> {
    // Size check
    if (file.size > this.maxFileSize) {
      throw new UserError(
        'FILE_TOO_LARGE' as never,
        '文件大小超过限制',
        { maxSize: this.maxFileSize },
      )
    }

    // Magic bytes detection (OOXML disambiguation uses filename extension)
    const detectedMime = detectMimeType(file.data, file.filename)
    if (detectedMime === null || !this.allowedMimeTypes.has(detectedMime)) {
      throw new UserError(
        'FILE_TYPE_NOT_ALLOWED' as never,
        '不支持的文件类型',
        {
          detectedType: detectedMime ?? 'unknown',
          allowedTypes: [...this.allowedMimeTypes],
        },
      )
    }

    // SHA-256 hash
    const sha256 = createHash('sha256').update(file.data).digest('hex')

    // Extension derived from detected MIME type - never from user filename (path-safe)
    const ext = MIME_TO_EXT[detectedMime] ?? ''
    const storagePath = join(
      tenantId,
      sha256.substring(0, 2),
      `${sha256}${ext}`,
    )
    const fullPath = join(this.storageDir, storagePath)

    // Ensure parent directory exists
    await mkdir(join(this.storageDir, tenantId, sha256.substring(0, 2)), {
      recursive: true,
    })

    // Atomic write: temp file -> rename
    const tempPath = `${fullPath}.tmp.${randomUUID()}`
    await writeFile(tempPath, file.data)
    await rename(tempPath, fullPath)

    // Build record
    const record: AttachmentRecord = {
      id: randomUUID(),
      tenantId,
      filename: sanitizeFilename(file.filename),
      contentType: detectedMime,
      size: file.size,
      sha256,
      storageBackend: 'local',
      storagePath,
      uploadedBy: userId,
      createdAt: new Date(),
      deletedAt: null,
    }

    await this.repo.insert(record)
    return record
  }

  /**
   * Download a file by ID within a tenant.
   * Returns null if not found or not owned by the tenant.
   */
  async download(
    id: string,
    tenantId: string,
  ): Promise<DownloadResult | null> {
    const record = await this.repo.findById(id, tenantId)
    if (record === null || record.deletedAt !== null) {
      return null
    }

    const fullPath = join(this.storageDir, record.storagePath)
    try {
      const data = await readFile(fullPath)
      return {
        data,
        name: record.filename,
        mimeType: record.contentType,
        record,
      }
    } catch {
      // File missing on disk but record exists — treat as not found
      return null
    }
  }

  /**
   * Soft-delete a file. Physical file is retained (Phase 2 GC).
   * Returns true if deleted, false if not found.
   */
  async delete(id: string, tenantId: string): Promise<boolean> {
    return this.repo.softDelete(id, tenantId)
  }

  /**
   * List attachments for a tenant with optional filtering and pagination.
   */
  async list(
    tenantId: string,
    filter?: FileFilter,
  ): Promise<ListResult> {
    const page = filter?.page ?? 1
    const pageSize = Math.min(
      filter?.pageSize ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )

    const { records, total } = await this.repo.list(tenantId, filter)

    // Apply pagination (repo may already do this, but ensure correctness)
    const start = (page - 1) * pageSize
    const paged = records.slice(start, start + pageSize)

    return {
      data: paged,
      total,
      page,
      pageSize,
    }
  }

  /**
   * Physically remove a file from disk (for tests / Phase 2 GC).
   * Safe to call even if the file does not exist.
   */
  async removePhysicalFile(storagePath: string): Promise<void> {
    const fullPath = join(this.storageDir, storagePath)
    try {
      await unlink(fullPath)
    } catch {
      // Already gone — no-op
    }
  }
}
