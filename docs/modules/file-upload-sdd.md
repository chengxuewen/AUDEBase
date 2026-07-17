# SDD: File Upload Module

**Module**: `@audebase/file-upload`
**Package Path**: `packages/file-upload/`
**Phase**: Phase 1b
**Status**: SDD Complete
**Decision References**: D4.1, file-storage.md, architecture.md §五

---

## 1. 概要

### 模块定位

File Upload 模块为 AUDEBase 平台提供文件上传与存储能力。作为横切关注点服务，在 Fastify 请求处理管线中拦截 multipart 上传请求，执行文件校验（类型、大小、路径安全），写入本地文件系统，并记录元数据到 attachment 表。

### 职责边界

| 范围 | 说明 |
|------|------|
| **负责** | multipart 文件接收、magic bytes 类型检测、文件大小限制、路径穿越防护、本地文件系统写入、attachment 元数据 CRUD、下载鉴权、软删除 |
| **不负责** | 图片缩略图生成（Phase 2）、病毒扫描（Phase 2）、MinIO/S3 存储（Phase 2）、RBAC 权限判断（依赖 Core 中间件）、文件 CDN 加速 |

### 设计目标

1. **零外部存储依赖** - Phase 1b 仅使用本地文件系统，不依赖 MinIO/S3 或云存储
2. **安全优先** - magic bytes 验证真实类型（不信任扩展名）、路径穿越防护、UUID 存储名
3. **多租户隔离** - 存储路径按 tenant_id 前缀隔离，查询强过滤 tenant_id
4. **可迁移** - 存储路径抽象接口设计为 Phase 2 S3 迁移预留
5. **20MB 默认上限** - 可配置 `AUDE_MAX_FILE_SIZE` 环境变量

---

## 2. 接口定义

### 数据模型

#### AttachmentRecord

```typescript
interface AttachmentRecord {
  /** UUID v4 */
  id: string
  /** 多租户隔离 */
  tenant_id: string
  /** 原始文件名（上传时用户提供的文件名） */
  filename: string
  /** MIME 类型（通过 magic bytes 检测） */
  content_type: string
  /** 文件大小（字节） */
  size: number
  /** 文件 SHA-256 哈希 */
  sha256: string
  /** 存储后端标识（Phase 1b: 'local' only） */
  storage_backend: 'local'
  /** 本地文件系统相对路径 */
  storage_path: string
  /** 上传用户 ID */
  uploaded_by: string
  /** 创建时间 */
  created_at: Date
  /** 软删除时间（null = 未删除） */
  deleted_at: Date | null
}
```

#### 数据库表定义（DDL）

```sql
CREATE TABLE attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       VARCHAR(64) NOT NULL,
  filename        VARCHAR(512) NOT NULL,
  content_type    VARCHAR(128) NOT NULL,
  size            BIGINT NOT NULL CHECK (size > 0 AND size <= 20971520),
  sha256          CHAR(64) NOT NULL,
  storage_backend VARCHAR(16) NOT NULL DEFAULT 'local',
  storage_path    VARCHAR(1024) NOT NULL,
  uploaded_by     UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_attachments_tenant_id ON attachments (tenant_id);
CREATE INDEX idx_attachments_tenant_created ON attachments (tenant_id, created_at DESC);
CREATE UNIQUE INDEX idx_attachments_sha256 ON attachments (sha256, tenant_id)
  WHERE deleted_at IS NULL;
```

### FileUploadService Class

```typescript
class FileUploadService {
  /**
   * 上传文件。
   * 校验类型/大小/路径安全 -> 写入临时文件 -> fsync -> rename -> 记录元数据
   * @returns AttachmentRecord
   */
  async upload(
    file: FileUpload,
    tenantId: string,
    userId: string,
  ): Promise<AttachmentRecord>

  /**
   * 下载文件。
   * 返回文件流 + 元数据。验证 tenant_id 归属。
   * @returns 文件可读流及元数据，或 null（文件不存在/不属于该租户）
   */
  async download(
    id: string,
    tenantId: string,
  ): Promise<{ stream: Readable; record: AttachmentRecord } | null>

  /**
   * 软删除文件。设置 deleted_at 时间戳。
   * 物理文件保留（Phase 2 支持物理清理）。
   * @returns true 如果删除成功，false 如果文件不存在
   */
  async delete(
    id: string,
    tenantId: string,
  ): Promise<boolean>

  /**
   * 列出租户下的文件。
   * 支持分页和类型过滤。
   */
  async list(
    tenantId: string,
    filter?: FileFilter,
  ): Promise<{ data: AttachmentRecord[]; meta: { total: number; page: number; pageSize: number } }>
}
```

### FileUpload Interface

```typescript
interface FileUpload {
  /** 文件原始名称 */
  filename: string
  /** MIME 类型（不可信，仅用于日志） */
  mimetype: string
  /** 文件数据 Buffer */
  data: Buffer
  /** 文件大小 */
  size: number
}
```

### FileFilter Interface

```typescript
interface FileFilter {
  page?: number
  pageSize?: number
  contentType?: string   // 按 MIME 类型前缀过滤（如 'image/'）
  filename?: string      // 模糊匹配原始文件名
}
```

### 存储路径结构

```typescript
// Phase 1b 路径格式
// /data/audebase/storage/{tenantId}/{sha256[:2]}/{sha256}
//
// 示例：
// /data/audebase/storage/tenant-abc/a1/a1b2c3d4e5f6...
//
// sha256[:2] 为前两个字符，作为子目录名，防止单目录文件过多
```

### Fastify Multipart 配置

```typescript
interface MultipartConfig {
  /** 最大文件大小（默认 20MB） */
  maxFileSize: number  // default: 20 * 1024 * 1024
  /** 上传临时目录 */
  tempDir: string       // default: os.tmpdir()
  /** 允许的 MIME 类型白名单 */
  allowedMimeTypes: Set<string>
}
```

### Public Exports (index.ts)

```typescript
export { FileUploadService } from './file-upload.service.js'
export type { AttachmentRecord, FileUpload, FileFilter, MultipartConfig } from './types.js'
```

### API 端点

| 方法 | 路径 | 认证 | 说明 |
|------|------|:----:|------|
| `POST` | `/api/files` | 是 | 上传文件（multipart/form-data） |
| `GET` | `/api/files/{id}` | 是 | 下载文件（内联预览或 `?download=1` 强制下载） |
| `DELETE` | `/api/files/{id}` | 是 | 软删除文件 |

#### POST /api/files

```
Content-Type: multipart/form-data
Body: file: <binary>

Response 201:
{
  "data": {
    "id": "uuid",
    "filename": "report.pdf",
    "content_type": "application/pdf",
    "size": 1048576,
    "sha256": "a1b2c3d4...",
    "created_at": "2026-07-17T00:00:00Z"
  }
}

Response 400:
{ "error": { "code": "FILE_TOO_LARGE", "message": "文件大小超过限制" } }

Response 415:
{ "error": { "code": "FILE_TYPE_NOT_ALLOWED", "message": "不支持的文件类型" } }
```

#### GET /api/files/{id}

```
Query params: ?download=1 (可选，强制 Content-Disposition: attachment)

Response 200:
  Content-Type: <detected MIME type>
  Content-Disposition: inline; filename="report.pdf"  (默认)
  Content-Disposition: attachment; filename="report.pdf"  (?download=1)
  Body: <binary file content>

Response 404:
{ "error": { "code": "FILE_NOT_FOUND", "message": "文件不存在" } }
```

#### DELETE /api/files/{id}

```
Response 200:
{ "data": { "deleted": true } }

Response 404:
{ "error": { "code": "FILE_NOT_FOUND", "message": "文件不存在" } }
```

---

## 3. 生命周期

### 初始化

```
Core 启动
  -> 检查存储根目录 /data/audebase/storage/ 是否存在，不存在则创建
  -> new FileUploadService({
       maxFileSize: 20 * 1024 * 1024,
       tempDir: os.tmpdir(),
       allowedMimeTypes: ALLOWED_TYPES
     })
  -> 注册 Fastify multipart 插件
  -> 注册路由: POST /api/files, GET /api/files/:id, DELETE /api/files/:id
```

### 上传处理流程

```
POST /api/files 进入
  -> Fastify multipart 解析
  -> 文件大小检查（拒绝 > maxFileSize）
  -> 读取前 4KB（用于 magic bytes 检测）
  -> magic bytes 验证 MIME 类型
  -> 检查扩展名白名单
  -> 文件名净化（去除危险字符）
  -> 计算 SHA-256
  -> 写入临时文件（非最终路径）
  -> fsync 确保落盘
  -> rename 到最终路径 /data/audebase/storage/{tenantId}/{sha256[:2]}/{sha256}
  -> INSERT attachment 记录
  -> 返回 201 + AttachmentRecord
```

### 下载处理流程

```
GET /api/files/{id} 进入
  -> 查询 attachment 表 WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  -> 未找到 -> 返回 404
  -> 打开文件流
  -> 设置 Content-Type / Content-Disposition / Content-Length
  -> 流式返回文件内容
```

### 删除处理流程

```
DELETE /api/files/{id} 进入
  -> 查询 attachment 表 WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  -> 未找到 -> 返回 404
  -> 设置 deleted_at = NOW()
  -> 物理文件保留（Phase 2 实现垃圾回收）
  -> 返回 { deleted: true }
```

### 关闭

无特殊关闭逻辑。文件流由 Node.js fs 模块自动管理，进程退出时释放。

---

## 4. 依赖关系

| 依赖 | 类型 | 用途 |
|------|------|------|
| `@audebase/shared-types` | workspace | `ErrorCode` 枚举、`PaginationMeta` |
| `@fastify/multipart` | npm | multipart/form-data 解析 |
| `node:crypto` | stdlib | SHA-256 哈希计算 |
| `node:fs` / `node:fs/promises` | stdlib | 文件读写、rename、fsync |
| `node:path` | stdlib | 路径组装与净化 |
| `file-type` | npm | magic bytes MIME 检测 |

### 运行时依赖说明

- **无 ORM 依赖**: attachment 表操作通过 Drizzle ORM 执行（`@audebase/core` 提供 DatabaseProvider）
- **无云存储 SDK**: Phase 1b 仅本地文件系统，Phase 2 引入 MinIO SDK（`@aws-sdk/client-s3`）

---

## 5. 错误码与错误处理

| 错误码 | HTTP | 场景 | 恢复策略 |
|--------|------|------|----------|
| `FILE_TOO_LARGE` | 413 | 文件大小超过 `AUDE_MAX_FILE_SIZE` | 客户端压缩或选择更小文件 |
| `FILE_TYPE_NOT_ALLOWED` | 415 | MIME 类型不在白名单中 | 客户端转换为允许格式 |
| `FILE_NOT_FOUND` | 404 | attachment 记录不存在或不属于该租户 | 客户端检查文件 ID |
| `FILE_PATH_TRAVERSAL` | 400 | 文件名包含 `../`、绝对路径等 | 客户端使用合法文件名 |

### 413 响应格式

```json
{
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "文件大小超过限制",
    "details": {
      "maxSize": 20971520,
      "maxSizeHuman": "20MB"
    }
  }
}
```

### 415 响应格式

```json
{
  "error": {
    "code": "FILE_TYPE_NOT_ALLOWED",
    "message": "不支持的文件类型",
    "details": {
      "detectedType": "application/x-msdownload",
      "allowedTypes": ["image/jpeg", "image/png", "application/pdf", "..."]
    }
  }
}
```

### 404 响应格式

```json
{
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "文件不存在"
  }
}
```

---

## 6. 安全考虑

### MIME 类型验证（Magic Bytes）

- 使用 `file-type` npm 包读取文件前 4KB 检测真实 MIME 类型
- 拒绝依赖 `Content-Type` 头或扩展名（可伪造）
- 检测结果与实际 MIME 类型不一致则拒绝

### 扩展名白名单

```
jpg, jpeg, png, gif, webp, pdf, doc, docx, xls, xlsx, csv, json, txt, zip
```

### 文件大小限制

- 默认 20MB（`AUDE_MAX_FILE_SIZE` 环境变量可配置）
- 在 multipart 解析阶段即拦截超大请求（Fastify bodyLimit）
- 硬件限制：40MB 硬上限（防止内存耗尽）

### 路径穿越防护

- 拒绝含 `../`、`..\\`、绝对路径（以 `/` 开头）的文件名
- 拒绝 Unicode 控制字符（`\u0000`-`\u001F`）
- 使用 UUID v4 作为存储文件名，不使用原始文件名
- 存储路径仅由 `tenantId` + `sha256` 构成，不含用户输入

### 多租户隔离

- 所有查询强制 `WHERE tenant_id = ?` 过滤
- 存储路径按 `{tenantId}` 前缀隔离
- 下载/删除操作验证资源归属 tenant_id

### 原子写入

- 先写入临时目录 → `fsync` 确保护盘 → `rename` 到最终路径
- 防止上传中断时产生残缺文件

### 恶意文件防护

- Phase 1b 不实现病毒扫描（依赖宿主环境安全策略）
- Phase 2 集成 ClamAV 扫描

### 竞态条件

- 临时文件使用随机名称（UUID），避免并发上传冲突
- `rename` 为原子操作（POSIX 语义）

---

## 7. Mock 约束

### FileUploadService Mock 约束

| 约束 | 说明 |
|------|------|
| async API | 所有公开方法返回 `Promise`，mock 必须支持 `async/await` |
| 真实文件 I/O | 集成测试使用临时目录（`fs.mkdtempSync()`），测试后清理 |
| 独立目录 | 每个测试使用独立临时存储根目录，测试间无共享文件状态 |
| 文件写入验证 | 测试应断言文件实际存在于预期路径（`fs.existsSync`） |
| 哈希验证 | 测试应验证 `sha256` 字段与上传文件的实际哈希一致 |

### Fastify Multipart Mock 约束

| 约束 | 说明 |
|------|------|
| Buffer 构造 | 测试构造 `{ filename, mimetype, data: Buffer }` 模拟 multipart 解析结果 |
| 白名单验证 | 测试应覆盖白名单内/外类型、空文件、超大文件 |
| 路径穿越 | 测试应覆盖包含 `../`、绝对路径、控制字符的文件名 |
| 并发上传 | 测试应验证并发上传不产生路径冲突 |

### 测试覆盖率要求

```
- 上传成功路径（白名单类型）   | 100%
- 上传拒绝路径（非法类型/过大） | 100%
- 路径穿越防护（3+ 变体）       | 100%
- 下载（存在/不存在/跨租户）    | 100%
- 软删除（存在/不存在/二次删除）| 100%
- 列表（空/有数据/分页/过滤）   | 100%
```

---

## 8. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-07-17 | 初始 SDD 创建 - Phase 1b 本地文件系统 + attachment 表 + magic bytes 校验 |