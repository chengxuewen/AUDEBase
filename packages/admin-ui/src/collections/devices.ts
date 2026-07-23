import type { CollectionDef } from './types'

export const devicesCollection: CollectionDef = {
  name: 'devices',
  title: '设备',
  fields: [
    { name: 'name',          type: 'string', label: '设备名称', required: true },
    { name: 'model',         type: 'string', label: '型号' },
    { name: 'status',        type: 'enum',   label: '状态', enumValues: ['online', 'offline', 'printing', 'error'] },
    { name: 'ipAddress',     type: 'string', label: 'IP 地址' },
    { name: 'lastHeartbeat', type: 'date',   label: '上次心跳', format: 'YYYY-MM-DD HH:mm:ss' },
  ],
}
