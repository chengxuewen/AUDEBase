# File Upload TDD 测试策略

> **模块**: `@audebase/file-upload`
> **依赖**: `node:fs`, `node:crypto`, `node:path`, `@fastify/multipart`, `file-type`, `@audebase/shared-types`
> **更新日期**: 2026-07-17
> **参考**: D4.1 (文件存储), file-storage.md, file-upload-sdd.md, database-schema.md §attachments

---

## 1. 测试策略概述

File Upload 模块提供 multipart 文件接收、magic bytes 类型检测、文件大小限制、路径穿越防护、本地文件系统写入、attachment 元数据 CRUD、下载鉴权、软删除等能力。测试以本地文件系统为基础，零外部依赖，覆盖文件类型/大小/路径安全校验及 CRUD 全流程。

| 测试类型 | 最低用例数 | 数据库 | 文件系统 |
|---------|:---:|------|---------|
| 单元测试 | 13+ | 无（mock DB） | 无（mock fs） |
| 集成测试 | 8+ | 真实 PostgreSQL（可选） | 真实临时目录 |
| 契约测试 | 4+ | 真实 PostgreSQL（可选） | 真实临时目录 |
| E2E 测试 | 1 流程 | Docker PostgreSQL | 本地目录 |

---

## 2. 模块结构

```
packages/file-upload/
├── src/
│   ├── index.ts                  # Plugin 入口 + 路由注册
│   ├── file-upload.service.ts    # FileUploadService (upload/download/delete/list)
│   ├── types.ts                  # AttachmentRecord, FileUpload, FileFilter, MultipartConfig
│   ├── storage-provider.ts       # LocalStorageProvider (读写文件系统)
│   ├── file-validator.ts         # Magic bytes 校验 + 大小/路径检查
│   ├── routes/
│   │   └── file.routes.ts        # POST /api/files, GET /api/files/:id, DELETE /api/files/:id
│   ├── __tests__/
│   │   ├── unit/
│   │   │   ├── file-upload.service.test.ts
│   │   │   ├── file-validator.test.ts
│   │   │   └── storage-provider.test.ts
│   │   ├── integration/
│   │   │   ├── file-upload.integration.test.ts
│   │   │   └── file-api.integration.test.ts
│   │   ├── contracts/
│   │   │   └── file-api.contract.test.ts
│   │   └── seeds/
│   │       └── attachment-records.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. 单元测试

### 3.1 FileUploadService 单元测试

```
测试文件: packages/file-upload/src/__tests__/unit/file-upload.service.test.ts
```

```typescript
import { describe, test, expect, beforeEach, vi } from 'vitest'
import { FileUploadService } from '../../file-upload.service'
import type { AttachmentRecord } from '../../types'

const mockDb = {
  insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'att-uuid' }]) }) }),
  select: vi.fn().mockReturnValue({ from: vi.fn() }),
  update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn() }) }) }),
  query: { attachments: { findMany: vi.fn(), findFirst: vi.fn() } },
}

const mockStorage = {
  write: vi.fn().mockResolvedValue(undefined),
  read: vi.fn(),
  delete: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn(),
}

describe('FileUploadService.upload', () => {
  let service: FileUploadService

  beforeEach(() => {
    vi.clearAllMocks()
    mockStorage.read.mockReset()
    mockStorage.exists.mockReset()
    service = new FileUploadService(mockDb as any, mockStorage as any, {
      maxFileSize: 20 * 1024 * 1024,
      allowedMimeTypes: new Set(['image/jpeg', 'image/png', 'application/pdf']),
    })
  })

  test('上传有效的 JPEG 文件', async () => {
    // Arrange
    const file = {
      filename: 'photo.jpg',
      mimetype: 'image/jpeg',
      data: Buffer.from('ffd8ffe0...valid-jpeg-bytes', 'utf8'),
      size: 1024 * 512,
    }

    // Act
    const result = await service.upload(file, 'tenant-1', 'user-uuid')

    // Assert
    expect(result).toBeDefined()
    expect(result.filename).toBe('photo.jpg')
    expect(result.content_type).toBe('image/jpeg')
    expect(result.tenant_id).toBe('tenant-1')
    expect(result.size).toBe(1024 * 512)
    expect(result.sha256).toHaveLength(64) // SHA-256 hex string
    expect(result.storage_backend).toBe('local')
    expect(mockStorage.write).toHaveBeenCalled()
    expect(mockDb.insert).toHaveBeenCalled()
  })

  test('上传有效的 PNG 文件', async () => {
    // Arrange
    const file = {
      filename: 'screenshot.png',
      mimetype: 'image/png',
      data: Buffer.from('89504e47...valid-png-bytes', 'utf8'),
      size: 1024 * 256,
    }

    // Act
    const result = await service.upload(file, 'tenant-1', 'user-uuid')

    // Assert
    expect(result.content_type).toBe('image/png')
    expect(mockStorage.write).toHaveBeenCalled()
  })

  test('上传有效的 PDF 文件', async () => {
    // Arrange
    const file = {
      filename: 'report.pdf',
      mimetype: 'application/pdf',
      data: Buffer.from('25504446...valid-pdf-bytes', 'utf8'),
      size: 1024 * 1024,
    }

    // Act
    const result = await service.upload(file, 'tenant-1', 'user-uuid')

    // Assert
    expect(result.content_type).toBe('application/pdf')
    expect(result.filename).toBe('report.pdf')
  })

  test('拒绝不支持的文件类型', async () => {
    // Arrange
    const file = {
      filename: 'virus.exe',
      mimetype: 'application/x-msdownload',
      data: Buffer.from('4d5a9000...exe-bytes', 'utf8'),
      size: 1024 * 50,
    }

    // Act & Assert
    await expect(
      service.upload(file, 'tenant-1', 'user-uuid'),
    ).rejects.toThrow(/FILE_TYPE_NOT_ALLOWED|不支持的文件类型/)
    expect(mockStorage.write).not.toHaveBeenCalled()
  })

  test('拒绝超过最大大小的文件', async () => {
    // Arrange
    const file = {
      filename: 'huge.mp4',
      mimetype: 'video/mp4',
      data: Buffer.alloc(21 * 1024 * 1024),
      size: 21 * 1024 * 1024,
    }

    // Act & Assert
    await expect(
      service.upload(file, 'tenant-1', 'user-uuid'),
    ).rejects.toThrow(/FILE_TOO_LARGE|文件大小超过/)
    expect(mockStorage.write).not.toHaveBeenCalled()
  })

  test('拒绝包含路径穿越的文件名 (../)', async () => {
    // Arrange
    const file = {
      filename: '../../etc/passwd',
      mimetype: 'image/jpeg',
      data: Buffer.from('ffd8ffe0...fake', 'utf8'),
      size: 100,
    }

    // Act & Assert
    await expect(
      service.upload(file, 'tenant-1', 'user-uuid'),
    ).rejects.toThrow(/FILE_PATH_TRAVERSAL|路径穿越/)
    expect(mockStorage.write).not.toHaveBeenCalled()
  })

  test('拒绝包含绝对路径的文件名 (/)', async () => {
    // Arrange
    const file = {
      filename: '/etc/passwd',
      mimetype: 'image/jpeg',
      data: Buffer.from('ffd8ffe0...fake', 'utf8'),
      size: 100,
    }

    // Act & Assert
    await expect(
      service.upload(file, 'tenant-1', 'user-uuid'),
    ).rejects.toThrow(/FILE_PATH_TRAVERSAL|路径穿越/)
  })

  test('magic bytes 不匹配扩展名时拒绝', async () => {
    // Arrange
    const file = {
      filename: 'safe.jpg',
      mimetype: 'image/jpeg',
      data: Buffer.from('89504e47...actual-png-bytes', 'utf8'), // PNG magic, jpg extension
      size: 100,
    }

    // Act & Assert — file-type 检测到实际类型为 PNG 但声明为 JPEG
    await expect(
      service.upload(file, 'tenant-1', 'user-uuid'),
    ).rejects.toThrow(/FILE_TYPE_NOT_ALLOWED|类型不匹配/)
  })
})

describe('FileUploadService.download', () => {
  test('下载存在的文件', async () => {
    // Arrange
    const record: AttachmentRecord = {
      id: 'att-1',
      tenant_id: 'tenant-1',
      filename: 'photo.jpg',
      content_type: 'image/jpeg',
      size: 1024 * 512,
      sha256: 'a'.repeat(64),
      storage_backend: 'local',
      storage_path: 'tenant-1/a1/a1b2c3d4...',
      uploaded_by: 'user-uuid',
      created_at: new Date(),
      deleted_at: null,
    }
    mockDb.query.attachments.findFirst.mockResolvedValue(record)
    mockStorage.read.mockResolvedValue(Buffer.from('fake-image-data'))

    // Act
    const result = await service.download('att-1', 'tenant-1')

    // Assert
    expect(result).not.toBeNull()
    expect(result!.record.id).toBe('att-1')
    expect(result!.stream).toBeDefined()
  })

  test('下载不存在的文件返回 null', async () => {
    // Arrange
    mockDb.query.attachments.findFirst.mockResolvedValue(null)

    // Act
    const result = await service.download('non-existent', 'tenant-1')

    // Assert
    expect(result).toBeNull()
  })

  test('跨租户下载返回 null', async () => {
    // Arrange  — 记录属于 tenant-1，但请求 tenant-2
    const record: AttachmentRecord = {
      id: 'att-1',
      tenant_id: 'tenant-1',
      filename: 'photo.jpg',
      content_type: 'image/jpeg',
      size: 100,
      sha256: 'a'.repeat(64),
      storage_backend: 'local',
      storage_path: 'tenant-1/a1/...',
      uploaded_by: 'user-uuid',
      created_at: new Date(),
      deleted_at: null,
    }
    mockDb.query.attachments.findFirst.mockResolvedValue(record)

    // Act — findFirst 返回 tenant-1 记录，但 service 应验证 tenant_id
    const result = await service.download('att-1', 'tenant-2')

    // Assert
    expect(result).toBeNull()
  })
})

describe('FileUploadService.delete', () => {
  test('软删除存在的文件', async () => {
    // Arrange
    mockDb.query.attachments.findFirst.mockResolvedValue({
      id: 'att-1',
      tenant_id: 'tenant-1',
    })
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'att-1' }]),
        }),
      }),
    })

    // Act
    const result = await service.delete('att-1', 'tenant-1')

    // Assert
    expect(result).toBe(true)
    expect(mockDb.update).toHaveBeenCalled()
  })

  test('删除不存在的文件返回 false', async () => {
    // Arrange
    mockDb.query.attachments.findFirst.mockResolvedValue(null)

    // Act
    const result = await service.delete('non-existent', 'tenant-1')

    // Assert
    expect(result).toBe(false)
  })
})

describe('FileUploadService.list', () => {
  test('列出租户下所有文件', async () => {
    // Arrange
    mockDb.query.attachments.findMany.mockResolvedValue([
      { id: 'att-1', tenant_id: 'tenant-1', filename: 'a.jpg' },
      { id: 'att-2', tenant_id: 'tenant-1', filename: 'b.pdf' },
    ])

    // Act
    const result = await service.list('tenant-1')

    // Assert
    expect(result.data).toHaveLength(2)
    expect(result.meta.total).toBe(2)
  })

  test('列出空租户返回空数组', async () => {
    // Arrange
    mockDb.query.attachments.findMany.mockResolvedValue([])

    // Act
    const result = await service.list('tenant-empty')

    // Assert
    expect(result.data).toHaveLength(0)
    expect(result.meta.total).toBe(0)
  })

  test('分页参数正确传递', async () => {
    // Arrange
    mockDb.query.attachments.findMany.mockResolvedValue([{ id: 'att-1', tenant_id: 'tenant-1' }])

    // Act
    const result = await service.list('tenant-1', { page: 2, pageSize: 10 })

    // Assert
    expect(result.meta.page).toBe(2)
    expect(result.meta.pageSize).toBe(10)
  })

  test('按 contentType 前缀过滤', async () => {
    // Arrange
    mockDb.query.attachments.findMany.mockResolvedValue([
      { id: 'att-1', content_type: 'image/jpeg', tenant_id: 'tenant-1' },
    ])

    // Act
    const result = await service.list('tenant-1', { contentType: 'image/' })

    // Assert
    expect(result.data).toHaveLength(1)
    expect(result.data[0].content_type).toMatch(/^image\//)
  })
})
```

### 3.2 FileValidator 单元测试

```
测试文件: packages/file-upload/src/__tests__/unit/file-validator.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'
import { FileValidator } from '../../file-validator'

describe('FileValidator.validateMimeType', () => {
  test('JPEG magic bytes 检测通过', async () => {
    // Arrange
    const validator = new FileValidator(new Set(['image/jpeg']))
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0])

    // Act
    const result = await validator.validateMimeType(buffer)

    // Assert
    expect(result).toBe(true)
  })

  test('PNG magic bytes 检测通过', async () => {
    // Arrange
    const validator = new FileValidator(new Set(['image/png']))
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47])

    // Act
    const result = await validator.validateMimeType(buffer)

    // Assert
    expect(result).toBe(true)
  })

  test('未知 magic bytes 被拒绝', async () => {
    // Arrange
    const validator = new FileValidator(new Set(['image/jpeg']))
    const buffer = Buffer.from([0x00, 0x00, 0x00, 0x00])

    // Act
    const result = await validator.validateMimeType(buffer)

    // Assert
    expect(result).toBe(false)
  })

  test('白名单外的合法文件也被拒绝', async () => {
    // Arrange
    const validator = new FileValidator(new Set(['image/jpeg']))
    const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46]) // PDF magic

    // Act
    const result = await validator.validateMimeType(buffer)

    // Assert
    expect(result).toBe(false)
  })
})

describe('FileValidator.checkFilePath', () => {
  test('普通文件名通过', () => {
    // Arrange
    const validator = new FileValidator(new Set())

    // Act
    const result = validator.checkFilePath('report.pdf')

    // Assert
    expect(result).toBe(true)
  })

  test('含 ../ 被拒绝', () => {
    // Arrange
    const validator = new FileValidator(new Set())

    // Act
    const result = validator.checkFilePath('../../etc/passwd')

    // Assert
    expect(result).toBe(false)
  })

  test('含 ..\\ 被拒绝', () => {
    // Arrange
    const validator = new FileValidator(new Set())

    // Act
    const result = validator.checkFilePath('..\\..\\etc\\passwd')

    // Assert
    expect(result).toBe(false)
  })

  test('绝对路径被拒绝', () => {
    // Arrange
    const validator = new FileValidator(new Set())

    // Act
    const result = validator.checkFilePath('/etc/passwd')

    // Assert
    expect(result).toBe(false)
  })
})

describe('FileValidator.checkFileSize', () => {
  test('20MB 内通过', () => {
    // Arrange
    const validator = new FileValidator(new Set(), 20 * 1024 * 1024)

    // Act
    const result = validator.checkFileSize(15 * 1024 * 1024)

    // Assert
    expect(result).toBe(true)
  })

  test('超过 20MB 被拒绝', () => {
    // Arrange
    const validator = new FileValidator(new Set(), 20 * 1024 * 1024)

    // Act
    const result = validator.checkFileSize(21 * 1024 * 1024)

    // Assert
    expect(result).toBe(false)
  })

  test('空文件（size=0）被拒绝', () => {
    // Arrange
    const validator = new FileValidator(new Set(), 20 * 1024 * 1024)

    // Act
    const result = validator.checkFileSize(0)

    // Assert
    expect(result).toBe(false)
  })
})
```

### 3.3 StorageProvider 单元测试

```
测试文件: packages/file-upload/src/__tests__/unit/storage-provider.test.ts
```

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { LocalStorageProvider } from '../../storage-provider'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

describe('LocalStorageProvider', () => {
  let tempRoot: string
  let provider: LocalStorageProvider

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audebase-upload-test-'))
    provider = new LocalStorageProvider(tempRoot)
  })

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('写入文件后文件实际存在', async () => {
    // Arrange
    const storagePath = 'tenant-1/a1/a1b2c3d4e5f67890'
    const data = Buffer.from('hello-world')

    // Act
    await provider.write(storagePath, data)

    // Assert
    const fullPath = path.join(tempRoot, storagePath)
    expect(fs.existsSync(fullPath)).toBe(true)
    expect(fs.readFileSync(fullPath)).toEqual(data)
  })

  test('读取已写入的文件', async () => {
    // Arrange
    const storagePath = 'tenant-1/b2/b2c3d4e5f6789012'
    const data = Buffer.from('file-content')
    await provider.write(storagePath, data)

    // Act
    const readData = await provider.read(storagePath)

    // Assert
    expect(readData).toEqual(data)
  })

  test('读取不存在的文件返回 null', async () => {
    // Act
    const result = await provider.read('nonexistent/path')

    // Assert
    expect(result).toBeNull()
  })

  test('删除文件', async () => {
    // Arrange
    const storagePath = 'tenant-1/c3/c3d4e5f678901234'
    await provider.write(storagePath, Buffer.from('delete-me'))

    // Act
    await provider.delete(storagePath)

    // Assert
    const fullPath = path.join(tempRoot, storagePath)
    expect(fs.existsSync(fullPath)).toBe(false)
  })

  test('并发写入不产生路径冲突', async () => {
    // Arrange
    const promises = Array.from({ length: 10 }, (_, i) =>
      provider.write(`tenant-1/concurrent/${i}`, Buffer.from(`data-${i}`))
    )

    // Act
    await Promise.all(promises)

    // Assert
    for (let i = 0; i < 10; i++) {
      expect(fs.existsSync(path.join(tempRoot, `tenant-1/concurrent/${i}`))).toBe(true)
    }
  })
})
```

---

## 4. 集成测试

### 4.1 FileUploadService 集成测试

```
测试文件: packages/file-upload/src/__tests__/integration/file-upload.integration.test.ts
```

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { FileUploadService } from '../../file-upload.service'
import { LocalStorageProvider } from '../../storage-provider'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'

// ponytail: minimal in-memory DB mock for integration. Real PG when Drizzle schema exists.
type AttachmentRow = Record<string, any>
const createMemoryDb = () => {
  const rows: AttachmentRow[] = []
  return {
    insert: (table: any) => ({
      values: (val: any) => ({
        returning: async () => {
          const record = { id: crypto.randomUUID(), ...val, created_at: new Date() }
          rows.push(record)
          return [record]
        },
      }),
    }),
    query: {
      attachments: {
        findFirst: async (opts: any) => {
          return rows.find(r =>
            Object.entries(opts.where ?? {}).every(([k, v]) => r[k] === v)
          ) ?? null
        },
        findMany: async (opts: any) => {
          let filtered = [...rows]
          if (opts?.where?.tenant_id) {
            filtered = filtered.filter(r => r.tenant_id === opts.where.tenant_id)
          }
          return filtered
        },
      },
    },
    update: (table: any) => ({
      set: (val: any) => ({
        where: (cond: any) => ({
          returning: async () => {
            const idx = rows.findIndex(r => r.id === cond.id)
            if (idx === -1) return []
            Object.assign(rows[idx], val)
            return [rows[idx]]
          },
        }),
      }),
    }),
  }
}

describe('File Upload 集成测试', () => {
  let tempRoot: string
  let storage: LocalStorageProvider
  let service: FileUploadService
  let db: ReturnType<typeof createMemoryDb>

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audebase-upload-int-'))
    storage = new LocalStorageProvider(tempRoot)
    db = createMemoryDb()
    service = new FileUploadService(db as any, storage as any, {
      maxFileSize: 20 * 1024 * 1024,
      allowedMimeTypes: new Set(['image/jpeg', 'image/png', 'application/pdf']),
    })
  })

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('上传文件后文件写入磁盘且元数据正确', async () => {
    // Arrange
    const file = {
      filename: 'photo.jpg',
      mimetype: 'image/jpeg',
      data: Buffer.from('ffd8ffe0...mock-jpeg', 'utf8'),
      size: 512,
    }

    // Act
    const record = await service.upload(file, 'tenant-1', 'user-uuid')

    // Assert
    // 文件实际存在于磁盘
    const fullPath = path.join(tempRoot, record.storage_path)
    expect(fs.existsSync(fullPath)).toBe(true)
    // SHA-256 哈希与实际内容一致
    const expectedHash = crypto.createHash('sha256').update(file.data).digest('hex')
    expect(record.sha256).toBe(expectedHash)
    expect(record.filename).toBe('photo.jpg')
    expect(record.tenant_id).toBe('tenant-1')
    expect(record.size).toBe(512)
  })

  test('上传后下载返回相同内容', async () => {
    // Arrange
    const fileData = Buffer.from('ffd8ffe0...mock-jpeg-content', 'utf8')
    const record = await service.upload({
      filename: 'photo.jpg',
      mimetype: 'image/jpeg',
      data: fileData,
      size: fileData.length,
    }, 'tenant-1', 'user-uuid')

    // Act
    const result = await service.download(record.id, 'tenant-1')

    // Assert
    expect(result).not.toBeNull()
    const chunks: Buffer[] = []
    for await (const chunk of result!.stream) {
      chunks.push(chunk as Buffer)
    }
    expect(Buffer.concat(chunks)).toEqual(fileData)
  })

  test('上传大文件（15MB）正常', async () => {
    // Arrange
    const fileData = Buffer.alloc(15 * 1024 * 1024, 'x')

    // Act
    const record = await service.upload({
      filename: 'large.bin',
      mimetype: 'application/pdf',
      data: fileData,
      size: fileData.length,
    }, 'tenant-1', 'user-uuid')

    // Assert
    expect(record.size).toBe(15 * 1024 * 1024)
    const fullPath = path.join(tempRoot, record.storage_path)
    expect(fs.existsSync(fullPath)).toBe(true)
    expect(fs.statSync(fullPath).size).toBe(15 * 1024 * 1024)
  })

  test('上传非法类型被拒绝，磁盘无残留', async () => {
    // Arrange
    const file = {
      filename: 'virus.exe',
      mimetype: 'application/x-msdownload',
      data: Buffer.from('MZ...exe-bytes', 'utf8'),
      size: 100,
    }

    // Act & Assert
    await expect(
      service.upload(file, 'tenant-1', 'user-uuid'),
    ).rejects.toThrow()
    // 确认临时目录已被清理
    const entries = fs.readdirSync(tempRoot)
    expect(entries).toHaveLength(0)
  })

  test('软删除后下载返回 404', async () => {
    // Arrange
    const record = await service.upload({
      filename: 'photo.jpg', mimetype: 'image/jpeg',
      data: Buffer.from('jpeg-data'), size: 9,
    }, 'tenant-1', 'user-uuid')

    // Act
    await service.delete(record.id, 'tenant-1')
    const result = await service.download(record.id, 'tenant-1')

    // Assert
    expect(result).toBeNull()
  })

  test('跨租户隔离：tenant-2 无法下载 tenant-1 的文件', async () => {
    // Arrange
    const record = await service.upload({
      filename: 'secret.docx', mimetype: 'application/pdf',
      data: Buffer.from('secret-content'), size: 14,
    }, 'tenant-1', 'user-uuid')

    // Act
    const result = await service.download(record.id, 'tenant-2')

    // Assert
    expect(result).toBeNull()
  })

  test('分页列表过滤 contentType', async () => {
    // Arrange — 上传两个图片和一个 PDF
    const jpeg = await service.upload({
      filename: 'a.jpg', mimetype: 'image/jpeg',
      data: Buffer.from('ffd8'), size: 4,
    }, 'tenant-1', 'user-uuid')
    const pdf = await service.upload({
      filename: 'b.pdf', mimetype: 'application/pdf',
      data: Buffer.from('pdf'), size: 3,
    }, 'tenant-1', 'user-uuid')

    // Act
    const result = await service.list('tenant-1', { contentType: 'image/' })

    // Assert
    expect(result.data.length).toBeGreaterThanOrEqual(1)
    result.data.forEach(r => {
      expect(r.content_type).toMatch(/^image\//)
    })
  })
})
```

### 4.2 API 集成测试

```
测试文件: packages/file-upload/src/__tests__/integration/file-api.integration.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'

describe('POST /api/files', () => {
  test('上传文件返回 201 + AttachmentRecord', async () => {
    // Arrange — 使用 Fastify inject
    // Act
    // Assert 201 + JSON body 含 id/filename/content_type/size/sha256
  })

  test('文件过大返回 413', async () => {
    // Arrange — 构造超大 multipart 请求
    // Assert 413 + FILE_TOO_LARGE errorCode
  })

  test('不支持类型返回 415', async () => {
    // Arrange — 构造 .exe 文件上传
    // Assert 415 + FILE_TYPE_NOT_ALLOWED
  })
})

describe('GET /api/files/{id}', () => {
  test('下载文件返回 200 + 文件流', async () => {
    // Arrange — 先上传再下载
    // Assert 200 + Content-Type + Content-Disposition + 文件内容
  })

  test('不存在文件返回 404', async () => {
    // Assert 404 + FILE_NOT_FOUND
  })
})

describe('DELETE /api/files/{id}', () => {
  test('软删除返回 200', async () => {
    // Arrange — 先上传再删除
    // Assert 200 + { deleted: true }
  })

  test('二次删除返回 404', async () => {
    // Arrange — 删除两次
    // Assert 第一次 200，第二次 404
  })
})
```

---

## 5. 契约测试

```
测试文件: packages/file-upload/src/__tests__/contracts/file-api.contract.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'

describe('POST /api/files 契约', () => {
  test('201 响应体包含 data.id (UUID) + data.content_type + data.sha256', async () => {
    // Arrange & Act — 上传有效文件
    // Assert 响应体中 data 字段形状匹配 AttachmentRecord
  })

  test('413 响应体符合 error 信封', async () => {
    // Arrange — 上传超大文件
    // Assert 响应体含 error.code / error.message / error.details.maxSize
  })
})

describe('GET /api/files/{id} 契约', () => {
  test('200 响应 Content-Type 匹配上传的 MIME', async () => {
    // Arrange — 上传 JPEG 文件并下载
    // Assert response Content-Type = image/jpeg
  })

  test('404 响应体符合 error 信封', async () => {
    // Arrange — 请求不存在的 id
    // Assert 响应体含 error.code = FILE_NOT_FOUND
  })
})
```

---

## 6. E2E 测试 (Playwright)

文件上传 E2E 属于 Phase 1b stretch goal（e2e-test-flows.md 待补充）：

```
packages/admin-ui/__e2e__/file-upload.e2e.ts
preSeed: { admin: true }
```

| 用例 | 描述 |
|------|------|
| 文件上传流程 | 登录 → 导航到文件管理 → 上传文件 → 验证列表中出现新记录 |
| 文件下载流程 | 上传文件 → 点击文件名 → 浏览器触发下载 |
| 文件删除流程 | 上传文件 → 删除 → 刷新列表 → 文件不再显示 |

---

## 7. 种子数据

```
packages/file-upload/src/__tests__/seeds/
└── attachment-records.ts
```

```typescript
import type { AttachmentRecord } from '../../types'
import * as crypto from 'node:crypto'

export function seedAttachmentRecords(
  tenantId: string = 'default-tenant',
  count: number = 5,
): AttachmentRecord[] {
  const types = ['image/jpeg', 'image/png', 'application/pdf', 'text/csv', 'application/json']
  const records: AttachmentRecord[] = []

  for (let i = 0; i < count; i++) {
    records.push({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      filename: `file-${i}.${types[i % types.length].split('/')[1]}`,
      content_type: types[i % types.length],
      size: 1024 * (i + 1),
      sha256: crypto.createHash('sha256').update(`content-${i}`).digest('hex'),
      storage_backend: 'local',
      storage_path: `${tenantId}/${crypto.randomUUID().slice(0, 2)}/${crypto.randomUUID()}`,
      uploaded_by: crypto.randomUUID(),
      created_at: new Date(Date.now() - i * 3600000),
      deleted_at: null,
    })
  }

  return records
}
```

---

## 8. Mock 策略

| 依赖 | 单元测试 | 集成测试 |
|------|---------|---------|
| 文件系统 (`node:fs`) | vi.fn() mock StorageProvider | 真实临时目录 (`fs.mkdtempSync`) |
| 数据库 (Drizzle) | vi.fn() mock DatabaseProvider | 内存 Map / 真实 PostgreSQL |
| `file-type` (magic bytes) | vi.fn() mock | 真实 `file-type` 库 |
| `node:crypto` (SHA-256) | 真实 crypto | 真实 crypto |
| `@fastify/multipart` | Buffer 构造模拟 | Fastify inject + form-data |

**存储路径规则**: 测试使用 `fs.mkdtempSync()` 创建独立临时根目录，每个测试独立目录，测试后 `fs.rmSync()` 清理。单元测试 mock StorageProvider 避免实际 I/O。

---

## 9. 文件系统验证（集成测试）

```typescript
describe('存储路径与布局', () => {
  test('文件存储在预期路径: {tenantId}/{sha256[:2]}/{sha256}', async () => {
    // Arrange — 上传文件
    // Assert storage_path 格式正确
  })

  test('文件实际 SHA-256 与元数据一致', async () => {
    // Arrange — 上传文件
    // Act — 读取磁盘文件计算 SHA-256
    // Assert 与 AttachmentRecord.sha256 一致
  })

  test('临时文件在失败时被清理', async () => {
    // Arrange — 构造一个在 fsync 前失败的场景
    // Assert 临时目录中无残留文件
  })
})
```

---

## 10. 覆盖率目标

| 指标 | 目标 | 关键路径 |
|------|:---:|------|
| 行覆盖率 | **85%+** | |
| 分支覆盖率 | **80%+** | 上传校验全部分支 + 错误路径 |
| 函数覆盖率 | **90%+** | upload/download/delete/list + validateMimeType/checkFilePath/checkFileSize |
| 集成 | 8+ | 上传/下载/删除/列表 + 租户隔离 + 路径安全 + 并发 |
| 契约 | 4+ | 201/413/415/404 响应体形状 |

---

## 11. CI 集成

```yaml
file-upload-test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @audebase/file-upload test:unit
    - run: pnpm --filter @audebase/file-upload test:integration
      env:
        AUDE_MAX_FILE_SIZE: 20971520
```

> 文件上传测试**不需要外部服务**（PostgreSQL / Redis / MinIO 均为可选）。单元测试 mock 文件系统，集成测试使用 `os.tmpdir()`。CI 零依赖启动。

---

## 12. 用例汇总

| 测试层 | 用例数 |
|--------|:---:|
| 单元 - file-upload.service | 13 |
| 单元 - file-validator | 12 |
| 单元 - storage-provider | 5 |
| 集成 - file-upload.integration | 8 |
| 集成 - file-api.integration | 7 |
| 契约 - file-api.contract | 4 |
| E2E - file-upload | 3 |
| **合计** | **52** |

---

## 13. 参考

- [file-upload-sdd.md](file-upload-sdd.md) — 接口定义、错误码、安全约束
- [database-schema.md](database-schema.md) §attachments — attachments 表 DDL
- [file-storage.md](file-storage.md) — Phase 1b 本地存储 + Phase 2 S3 迁移路径
- [api-conventions.md](api-conventions.md) — 分页/过滤/错误信封格式
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — D4.1 文件存储多租户隔离

> **上游 TDD 参考**: [shared-types-tdd.md §1](shared-types-tdd.md) — ErrorCode 枚举; [audit-tdd.md §5](audit-tdd.md) — 契约测试模式