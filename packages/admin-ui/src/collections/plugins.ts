import type { CollectionDef } from './types'

export const pluginsCollection: CollectionDef = {
  name: 'plugins',
  title: '插件',
  fields: [
    { name: 'name',        type: 'string',  label: '插件名称', required: true },
    { name: 'version',     type: 'string',  label: '版本' },
    { name: 'enabled',     type: 'boolean', label: '已启用' },
    { name: 'category',    type: 'enum',    label: '分类', enumValues: ['SYSTEM', 'oa', 'erp', 'mes', 'isolated'] },
    { name: 'description', type: 'string',  label: '描述' },
    { name: 'installedAt', type: 'date',    label: '安装时间' },
  ],
}
