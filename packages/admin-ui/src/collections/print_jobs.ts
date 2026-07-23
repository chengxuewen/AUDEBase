import type { CollectionDef } from './types'

export const printJobsCollection: CollectionDef = {
  name: 'print_jobs',
  title: '打印任务',
  fields: [
    { name: 'name',       type: 'string',    label: '任务名称', required: true },
    { name: 'status',     type: 'enum',      label: '状态',     enumValues: ['queued', 'printing', 'done', 'failed'] },
    { name: 'deviceId',   type: 'belongsTo', label: '设备',     target: 'devices' },
    { name: 'materialId', type: 'belongsTo', label: '材料',     target: 'materials' },
    { name: 'startedAt',  type: 'date',      label: '开始时间', format: 'YYYY-MM-DD HH:mm' },
  ],
}
