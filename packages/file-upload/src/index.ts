/**
 * @audebase/file-upload - Public API
 */

export { FileUploadService } from './file-upload-service.js'
export {
  DEFAULT_MAX_FILE_SIZE,
  HARD_MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  MAGIC_BYTES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './constants.js'
export type {
  AttachmentRecord,
  FileUpload,
  FileFilter,
  FileUploadOptions,
  DownloadResult,
  ListResult,
  AttachmentRepository,
} from './types.js'
