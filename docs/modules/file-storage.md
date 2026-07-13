# AUDEBase 文件上传与存储

> 从 `.agents/memorys/decisions.md` D4.1 扩展
> Phase 1a-ready — 架构定义完成。Phase 1 实施时补充实现细节。

## 数据模型

```typescript
interface FileRecord {
  id: string
  tenant_id: string // 多租户隔离
  filename: string // 原始文件名
  mimetype: string // MIME 类型
  size: number // 字节数
  sha256: string // content-addressed 存储键
  storage_backend: 'local' | 's3' // Phase 1: local only
  created_at: Date
  created_by: string // 上传用户 ID
}
```

## 存储路径（D4.1）

| 阶段 | 方案 |
|------|------|
| Phase 1 | 本地文件系统 `/data/audebase/storage/{tenantId}/{sha256[:2]}/{sha256}` |
| Phase 2 | DB 元数据 + MinIO/S3 content-addressed 去重（Odoo ir.attachment 模式） |

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/files/upload` | multipart/form-data 上传文件，返回 FileRecord |
| `GET` | `/api/files/{id}` | 下载/查看文件（检查 RBAC + tenant_id） |
| `DELETE` | `/api/files/{id}` | 删除文件记录 + 物理文件 |

## 安全约束（Phase 1b）

### 文件上传
- **MIME 验证**: 通过 magic bytes 检测真实文件类型（`file-type` npm 包），禁止依赖 `Content-Type` 头或扩展名
- **扩展名白名单**: jpg, jpeg, png, gif, webp, pdf, doc, docx, xls, xlsx, csv, json, txt, zip
- **文件大小上限**: 50MB（可配置 `AUDE_MAX_FILE_SIZE`）
- **文件名净化**: 使用 `sanitize-filename` 去除路径分隔符、Unicode 控制字符等危险字符
- **路径穿越防护**: 拒绝含 `../`、绝对路径、符号链接的文件名
- **竞态条件**: 使用原子写入（先写临时文件 → fsync → rename）
- **恶意文件**: Phase 1 不实现病毒扫描（依赖宿主环境安全策略），Phase 2 集成 ClamAV

### 访问控制
- 所有操作注入 tenant_id 过滤（D4.1）
- 下载/删除操作检查 RBAC 权限 + 资源归属
- GET 端点支持 `?download=1` 强制下载（Content-Disposition: attachment）

### 存储路径
- Phase 1: 本地 `/data/audebase/storage/{tenantId}/{sha256[:2]}/{sha256}`
- presigned URL（Phase 2 S3 模式）：直传 MinIO/S3，减少 Core 带宽

## 安全参考
- OWASP File Upload Cheat Sheet
- CWE-434: Unrestricted Upload of File with Dangerous Type
- CWE-22: Path Traversal

## 图片处理（Phase 2）

- 上传时自动生成缩略图（sharp）
- 按预设尺寸缓存（`?size=thumb|small|medium|large`）
- 保持与 Odoo ir.attachment + Directus Files 的设计一致

## 参考

- decisions.md: D4.1
- architecture.md: §五
- Odoo ir.attachment 模式
- Directus Files collection + Storage Adapter
