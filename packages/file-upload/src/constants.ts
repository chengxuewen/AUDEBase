/**
 * @audebase/file-upload - Constants
 */

/** Default maximum file size: 20 MB */
export const DEFAULT_MAX_FILE_SIZE = 20 * 1024 * 1024

/** Hard ceiling: 40 MB — never allow beyond this even if configured higher */
export const HARD_MAX_FILE_SIZE = 40 * 1024 * 1024

/**
 * Allowed MIME types (whitelist).
 * Phase 1b: JPEG, PNG, PDF, XLSX, DOCX.
 */
export const ALLOWED_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const

/**
 * Magic-byte signatures for MIME type detection.
 * Each entry: [mimeType, hex-prefix].
 * The prefix is compared against the first N bytes of the file.
 */
export const MAGIC_BYTES: ReadonlyArray<{ readonly mime: string; readonly hex: string }> = [
  { mime: 'image/jpeg', hex: 'ffd8ff' },
  { mime: 'image/png', hex: '89504e47' },
  { mime: 'application/pdf', hex: '25504446' },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    hex: '504b0304',
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    hex: '504b0304',
  },
] as const

/** Default page size for list queries */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum page size cap */
export const MAX_PAGE_SIZE = 100
