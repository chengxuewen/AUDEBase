# AUDEBase 文件上传与存储

> 从 `.agents/memorys/decisions.md` D4.1 扩展
> Phase 0 — 架构定义阶段。Phase 1 实施时补充实现细节。

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

## 安全约束

- 上传文件类型白名单（MIME type 校验，非扩展名）
- 文件大小上限（默认 50MB，可配置）
- 所有操作注入 tenant_id 过滤
- presigned URL（Phase 2 S3 模式）：直传 MinIO/S3，减少 Core 带宽

## 图片处理（Phase 2）

- 上传时自动生成缩略图（sharp）
- 按预设尺寸缓存（`?size=thumb|small|medium|large`）
- 保持与 Odoo ir.attachment + Directus Files 的设计一致

## 参考

- decisions.md: D4.1
- architecture.md: §五
- Odoo ir.attachment 模式
- Directus Files collection + Storage Adapter
