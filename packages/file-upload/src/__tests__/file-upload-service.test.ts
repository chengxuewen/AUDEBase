/**
 * @audebase/file-upload - FileUploadService tests
 *
 * AAA pattern. Uses real temp directories for filesystem and an
 * in-memory mock for AttachmentRepository.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm, readdir, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { FileUploadService } from '../file-upload-service.js'
import type {
  AttachmentRecord,
  AttachmentRepository,
  FileFilter,
  FileUpload,
  FileUploadOptions,
} from '../types.js'

// --- In-memory repository mock ---

class InMemoryAttachmentRepository implements AttachmentRepository {
  private records = new Map<string, AttachmentRecord>()

  async insert(record: AttachmentRecord): Promise<void> {
    this.records.set(record.id, { ...record })
  }

  async findById(
    id: string,
    tenantId: string,
  ): Promise<AttachmentRecord | null> {
    const r = this.records.get(id)
    if (r === undefined || r.tenantId !== tenantId) return null
    return { ...r }
  }

  async list(
    tenantId: string,
    filter?: FileFilter,
  ): Promise<{ records: AttachmentRecord[]; total: number }> {
    let items = [...this.records.values()].filter(
      (r) => r.tenantId === tenantId && r.deletedAt === null,
    )

    if (filter?.contentType !== undefined) {
      items = items.filter((r) =>
        r.contentType.startsWith(filter.contentType!),
      )
    }
    if (filter?.filename !== undefined) {
      items = items.filter((r) =>
        r.filename.includes(filter.filename!),
      )
    }

    // Sort by createdAt desc
    items.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    )

    return { records: items, total: items.length }
  }

  async softDelete(id: string, tenantId: string): Promise<boolean> {
    const r = this.records.get(id)
    if (r === undefined || r.tenantId !== tenantId || r.deletedAt !== null) {
      return false
    }
    r.deletedAt = new Date()
    return true
  }
}

// --- Test file data ---

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d])
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]) // xlsx/docx

function makeJpeg(): Buffer {
  return Buffer.concat([JPEG_MAGIC, Buffer.from('jpeg-body-data')])
}
function makePng(): Buffer {
  return Buffer.concat([PNG_MAGIC, Buffer.from('png-body-data')])
}
function makePdf(): Buffer {
  return Buffer.concat([PDF_MAGIC, Buffer.from('%PDF-1.4 content')])
}
function makeXlsx(): Buffer {
  return Buffer.concat([ZIP_MAGIC, Buffer.from('xlsx-zip-payload')])
}
function makeDocx(): Buffer {
  return Buffer.concat([ZIP_MAGIC, Buffer.from('docx-zip-payload')])
}

// --- Test suite ---

describe('FileUploadService', () => {
  let storageDir: string
  let repo: InMemoryAttachmentRepository
  let service: FileUploadService

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'aude-file-upload-'))
    repo = new InMemoryAttachmentRepository()
    const options: FileUploadOptions = { storageDir }
    service = new FileUploadService(repo, options)
  })

  afterEach(async () => {
    await rm(storageDir, { recursive: true, force: true })
  })

  // --- Upload: success cases ---

  describe('upload', () => {
    it('uploads a valid JPEG and returns correct metadata', async () => {
      // Arrange
      const data = makeJpeg()
      const file: FileUpload = {
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        data,
        size: data.length,
      }

      // Act
      const record = await service.upload(file, 'tenant-1', 'user-1')

      // Assert
      expect(record.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )
      expect(record.tenantId).toBe('tenant-1')
      expect(record.filename).toBe('photo.jpg')
      expect(record.contentType).toBe('image/jpeg')
      expect(record.size).toBe(data.length)
      expect(record.sha256).toBe(
        createHash('sha256').update(data).digest('hex'),
      )
      expect(record.storageBackend).toBe('local')
      expect(record.uploadedBy).toBe('user-1')
      expect(record.createdAt).toBeInstanceOf(Date)
      expect(record.deletedAt).toBeNull()
    })

    it('uploads a valid PNG and returns record', async () => {
      // Arrange
      const data = makePng()
      const file: FileUpload = {
        filename: 'image.png',
        mimeType: 'image/png',
        data,
        size: data.length,
      }

      // Act
      const record = await service.upload(file, 'tenant-1', 'user-1')

      // Assert
      expect(record.contentType).toBe('image/png')
      expect(record.sha256).toHaveLength(64)
    })

    it('uploads a valid PDF and returns record', async () => {
      // Arrange
      const data = makePdf()
      const file: FileUpload = {
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        data,
        size: data.length,
      }

      // Act
      const record = await service.upload(file, 'tenant-1', 'user-1')

      // Assert
      expect(record.contentType).toBe('application/pdf')
    })

    it('uploads a valid XLSX and returns record', async () => {
      // Arrange
      const data = makeXlsx()
      const file: FileUpload = {
        filename: 'spreadsheet.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        data,
        size: data.length,
      }

      // Act
      const record = await service.upload(file, 't1', 'u1')

      // Assert
      expect(record.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
    })

    it('uploads a valid DOCX and returns record', async () => {
      // Arrange
      const data = makeDocx()
      const file: FileUpload = {
        filename: 'document.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        data,
        size: data.length,
      }

      // Act
      const record = await service.upload(file, 't1', 'u1')

      // Assert
      expect(record.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )
    })

    it('writes the file to disk at the expected path', async () => {
      // Arrange
      const data = makeJpeg()
      const file: FileUpload = {
        filename: 'disk-test.jpg',
        mimeType: 'image/jpeg',
        data,
        size: data.length,
      }

      // Act
      const record = await service.upload(file, 'tenant-disk', 'u1')

      // Assert
      const fullPath = join(storageDir, record.storagePath)
      const written = await readFile(fullPath)
      expect(written).toEqual(data)
    })

    it('computes SHA-256 hash correctly', async () => {
      // Arrange
      const data = makeJpeg()
      const expectedHash = createHash('sha256').update(data).digest('hex')
      const file: FileUpload = {
        filename: 'hash-test.jpg',
        mimeType: 'image/jpeg',
        data,
        size: data.length,
      }

      // Act
      const record = await service.upload(file, 't1', 'u1')

      // Assert
      expect(record.sha256).toBe(expectedHash)
    })
  })

  // --- Upload: rejection cases ---

  describe('upload rejection', () => {
    it('rejects unsupported file type (text/plain)', async () => {
      // Arrange
      const data = Buffer.from('hello world')
      const file: FileUpload = {
        filename: 'notes.txt',
        mimeType: 'text/plain',
        data,
        size: data.length,
      }

      // Act + Assert
      await expect(service.upload(file, 't1', 'u1')).rejects.toThrow(
        '不支持的文件类型',
      )
    })

    it('rejects file exceeding size limit', async () => {
      // Arrange
      const data = makeJpeg()
      const file: FileUpload = {
        filename: 'big.jpg',
        mimeType: 'image/jpeg',
        data,
        size: 30 * 1024 * 1024, // 30MB > 20MB default
      }

      // Act + Assert
      await expect(service.upload(file, 't1', 'u1')).rejects.toThrow(
        '文件大小超过限制',
      )
    })

    it('rejects file with wrong magic bytes but correct extension', async () => {
      // Arrange - a .jpg file that is actually plain text
      const data = Buffer.from('this is not a jpeg')
      const file: FileUpload = {
        filename: 'fake.jpg',
        mimeType: 'image/jpeg',
        data,
        size: data.length,
      }

      // Act + Assert
      await expect(service.upload(file, 't1', 'u1')).rejects.toThrow(
        '不支持的文件类型',
      )
    })

    it('sanitises path traversal filename and uses UUID storage', async () => {
      // Arrange
      const data = makeJpeg()
      const file: FileUpload = {
        filename: '../../../etc/passwd',
        mimeType: 'image/jpeg',
        data,
        size: data.length,
      }

      // Act
      const record = await service.upload(file, 't1', 'u1')

      // Assert - filename is sanitised, storage path uses sha256 (no ../)
      expect(record.filename).not.toContain('..')
      expect(record.filename).not.toContain('/')
      expect(record.storagePath).not.toContain('..')
      // storagePath: {tenantId}/{sha256[:2]}/{sha256}.ext (ext from MIME, not user)
      expect(record.storagePath).toMatch(
        /^t1\/[0-9a-f]{2}\/[0-9a-f]{64}(\.[a-z]+)?$/,
      )
    })

    it('sanitises filename with backslash path traversal', async () => {
      // Arrange
      const data = makeJpeg()
      const file: FileUpload = {
        filename: '..\\..\\windows\\system32',
        mimeType: 'image/jpeg',
        data,
        size: data.length,
      }

      // Act
      const record = await service.upload(file, 't1', 'u1')

      // Assert
      expect(record.filename).not.toContain('..')
      expect(record.filename).not.toContain('\\')
    })

    it('sanitises filename with null bytes', async () => {
      // Arrange
      const data = makeJpeg()
      const file: FileUpload = {
        filename: 'evil\u0000.jpg',
        mimeType: 'image/jpeg',
        data,
        size: data.length,
      }

      // Act
      const record = await service.upload(file, 't1', 'u1')

      // Assert
      expect(record.filename).not.toContain('\u0000')
    })

    it('respects custom maxFileSize option', async () => {
      // Arrange
      const smallRepo = new InMemoryAttachmentRepository()
      const smallService = new FileUploadService(smallRepo, {
        storageDir,
        maxFileSize: 100,
      })
      const data = makeJpeg() // ~15 bytes
      const file: FileUpload = {
        filename: 'ok.jpg',
        mimeType: 'image/jpeg',
        data,
        size: data.length,
      }
      const bigFile: FileUpload = {
        filename: 'too-big.jpg',
        mimeType: 'image/jpeg',
        data: Buffer.concat([data, Buffer.alloc(200)]),
        size: 200 + data.length,
      }

      // Act + Assert
      const record = await smallService.upload(file, 't1', 'u1')
      expect(record.size).toBe(data.length)

      await expect(smallService.upload(bigFile, 't1', 'u1')).rejects.toThrow(
        '文件大小超过限制',
      )
    })

    it('respects custom allowedMimeTypes option', async () => {
      // Arrange - only allow PDF
      const pdfOnlyRepo = new InMemoryAttachmentRepository()
      const pdfOnlyService = new FileUploadService(pdfOnlyRepo, {
        storageDir,
        allowedMimeTypes: ['application/pdf'],
      })
      const jpegFile: FileUpload = {
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        data: makeJpeg(),
        size: 15,
      }

      // Act + Assert - JPEG rejected even though magic bytes match
      await expect(pdfOnlyService.upload(jpegFile, 't1', 'u1')).rejects.toThrow(
        '不支持的文件类型',
      )
    })
  })

  // --- Download ---

  describe('download', () => {
    it('downloads an existing file with correct data', async () => {
      // Arrange
      const data = makePdf()
      const file: FileUpload = {
        filename: 'download-test.pdf',
        mimeType: 'application/pdf',
        data,
        size: data.length,
      }
      const record = await service.upload(file, 'tenant-dl', 'u1')

      // Act
      const result = await service.download(record.id, 'tenant-dl')

      // Assert
      expect(result).not.toBeNull()
      expect(result!.data).toEqual(data)
      expect(result!.name).toBe('download-test.pdf')
      expect(result!.mimeType).toBe('application/pdf')
      expect(result!.record.id).toBe(record.id)
    })

    it('returns null for non-existent file', async () => {
      // Arrange
      const fakeId = randomUUID()

      // Act
      const result = await service.download(fakeId, 'tenant-1')

      // Assert
      expect(result).toBeNull()
    })

    it('returns null when file belongs to different tenant', async () => {
      // Arrange
      const data = makeJpeg()
      const file: FileUpload = {
        filename: 'cross-tenant.jpg',
        mimeType: 'image/jpeg',
        data,
        size: data.length,
      }
      const record = await service.upload(file, 'tenant-a', 'u1')

      // Act - try to download as tenant-b
      const result = await service.download(record.id, 'tenant-b')

      // Assert
      expect(result).toBeNull()
    })

    it('returns null for soft-deleted file', async () => {
      // Arrange
      const data = makeJpeg()
      const file: FileUpload = {
        filename: 'delete-me.jpg',
        mimeType: 'image/jpeg',
        data,
        size: data.length,
      }
      const record = await service.upload(file, 'tenant-del', 'u1')
      await service.delete(record.id, 'tenant-del')

      // Act
      const result = await service.download(record.id, 'tenant-del')

      // Assert
      expect(result).toBeNull()
    })
  })

  // --- Delete ---

  describe('delete', () => {
    it('soft-deletes an existing file', async () => {
      // Arrange
      const data = makeJpeg()
      const file: FileUpload = {
        filename: 'to-delete.jpg',
        mimeType: 'image/jpeg',
        data,
        size: data.length,
      }
      const record = await service.upload(file, 'tenant-del', 'u1')

      // Act
      const result = await service.delete(record.id, 'tenant-del')

      // Assert
      expect(result).toBe(true)

      // Verify download no longer works
      const dl = await service.download(record.id, 'tenant-del')
      expect(dl).toBeNull()
    })

    it('returns false for non-existent file', async () => {
      // Act
      const result = await service.delete(randomUUID(), 'tenant-1')

      // Assert
      expect(result).toBe(false)
    })

    it('returns false when deleting file from wrong tenant', async () => {
      // Arrange
      const data = makeJpeg()
      const file: FileUpload = {
        filename: 'not-yours.jpg',
        mimeType: 'image/jpeg',
        data,
        size: data.length,
      }
      const record = await service.upload(file, 'tenant-a', 'u1')

      // Act
      const result = await service.delete(record.id, 'tenant-b')

      // Assert
      expect(result).toBe(false)
    })

    it('returns false when deleting already-deleted file', async () => {
      // Arrange
      const data = makeJpeg()
      const file: FileUpload = {
        filename: 'already-gone.jpg',
        mimeType: 'image/jpeg',
        data,
        size: data.length,
      }
      const record = await service.upload(file, 'tenant-d', 'u1')
      await service.delete(record.id, 'tenant-d')

      // Act
      const result = await service.delete(record.id, 'tenant-d')

      // Assert
      expect(result).toBe(false)
    })
  })

  // --- List ---

  describe('list', () => {
    it('returns paginated results', async () => {
      // Arrange - upload 5 files
      for (let i = 0; i < 5; i++) {
        const data = makeJpeg()
        await service.upload(
          {
            filename: `file-${i}.jpg`,
            mimeType: 'image/jpeg',
            data,
            size: data.length,
          },
          'tenant-list',
          'u1',
        )
      }

      // Act
      const result = await service.list('tenant-list', {
        page: 1,
        pageSize: 2,
      })

      // Assert
      expect(result.data).toHaveLength(2)
      expect(result.total).toBe(5)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(2)
    })

    it('returns second page correctly', async () => {
      // Arrange
      for (let i = 0; i < 5; i++) {
        const data = makeJpeg()
        await service.upload(
          {
            filename: `page2-${i}.jpg`,
            mimeType: 'image/jpeg',
            data,
            size: data.length,
          },
          'tenant-list',
          'u1',
        )
      }

      // Act
      const result = await service.list('tenant-list', {
        page: 2,
        pageSize: 2,
      })

      // Assert
      expect(result.data).toHaveLength(2)
      expect(result.page).toBe(2)
    })

    it('only returns files for the specified tenant', async () => {
      // Arrange
      const dataA = makeJpeg()
      const dataB = makePdf()
      await service.upload(
        { filename: 'a.jpg', mimeType: 'image/jpeg', data: dataA, size: dataA.length },
        'tenant-a',
        'u1',
      )
      await service.upload(
        { filename: 'b.pdf', mimeType: 'application/pdf', data: dataB, size: dataB.length },
        'tenant-b',
        'u1',
      )

      // Act
      const result = await service.list('tenant-a')

      // Assert
      expect(result.data).toHaveLength(1)
      expect(result.data[0]!.tenantId).toBe('tenant-a')
      expect(result.data[0]!.filename).toBe('a.jpg')
    })

    it('filters by contentType prefix', async () => {
      // Arrange
      const jpeg = makeJpeg()
      const pdf = makePdf()
      await service.upload(
        { filename: 'img.jpg', mimeType: 'image/jpeg', data: jpeg, size: jpeg.length },
        't-filter',
        'u1',
      )
      await service.upload(
        { filename: 'doc.pdf', mimeType: 'application/pdf', data: pdf, size: pdf.length },
        't-filter',
        'u1',
      )

      // Act
      const result = await service.list('t-filter', {
        contentType: 'image/',
      })

      // Assert
      expect(result.data).toHaveLength(1)
      expect(result.data[0]!.contentType).toBe('image/jpeg')
    })

    it('filters by filename substring', async () => {
      // Arrange
      const j1 = makeJpeg()
      const j2 = makeJpeg()
      await service.upload(
        { filename: 'report-q1.jpg', mimeType: 'image/jpeg', data: j1, size: j1.length },
        't-name',
        'u1',
      )
      await service.upload(
        { filename: 'photo.jpg', mimeType: 'image/jpeg', data: j2, size: j2.length },
        't-name',
        'u1',
      )

      // Act
      const result = await service.list('t-name', { filename: 'report' })

      // Assert
      expect(result.data).toHaveLength(1)
      expect(result.data[0]!.filename).toBe('report-q1.jpg')
    })

    it('returns empty for tenant with no files', async () => {
      // Act
      const result = await service.list('empty-tenant')

      // Assert
      expect(result.data).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('excludes soft-deleted files', async () => {
      // Arrange
      const d1 = makeJpeg()
      const d2 = makeJpeg()
      const r1 = await service.upload(
        { filename: 'keep.jpg', mimeType: 'image/jpeg', data: d1, size: d1.length },
        't-del',
        'u1',
      )
      await service.upload(
        { filename: 'delete.jpg', mimeType: 'image/jpeg', data: d2, size: d2.length },
        't-del',
        'u1',
      )
      await service.delete(r1.id, 't-del')

      // Act
      const result = await service.list('t-del')

      // Assert
      expect(result.data).toHaveLength(1)
      expect(result.data[0]!.filename).toBe('delete.jpg')
    })
  })

  // --- Storage path isolation ---

  describe('storage isolation', () => {
    it('creates tenant-specific subdirectories', async () => {
      // Arrange
      const d1 = makeJpeg()
      const d2 = makePdf()

      // Act
      await service.upload(
        { filename: 'a.jpg', mimeType: 'image/jpeg', data: d1, size: d1.length },
        'tenant-x',
        'u1',
      )
      await service.upload(
        { filename: 'b.pdf', mimeType: 'application/pdf', data: d2, size: d2.length },
        'tenant-y',
        'u1',
      )

      // Assert
      const dirs = await readdir(storageDir)
      expect(dirs).toContain('tenant-x')
      expect(dirs).toContain('tenant-y')
    })

    it('file exists on disk after upload', async () => {
      // Arrange
      const data = makeJpeg()
      const file: FileUpload = {
        filename: 'exists.jpg',
        mimeType: 'image/jpeg',
        data,
        size: data.length,
      }

      // Act
      const record = await service.upload(file, 't-exist', 'u1')

      // Assert
      const fullPath = join(storageDir, record.storagePath)
      const s = await stat(fullPath)
      expect(s.isFile()).toBe(true)
      expect(s.size).toBe(data.length)
    })
  })
})
