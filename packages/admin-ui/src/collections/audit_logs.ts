import type { CollectionDef } from './types'

export const auditLogsCollection: CollectionDef = {
  name: 'audit_logs',
  title: '审计日志',
  fields: [
    { name: 'actorId',      type: 'string', label: '操作人' },
    { name: 'action',       type: 'enum',   label: '操作', enumValues: ['create', 'update', 'delete', 'login', 'logout'] },
    { name: 'resourceType', type: 'string', label: '资源类型' },
    { name: 'resourceId',   type: 'string', label: '资源 ID' },
    { name: 'ip',           type: 'string', label: 'IP 地址' },
    { name: 'createdAt',    type: 'date',   label: '操作时间' },
  ],
}
