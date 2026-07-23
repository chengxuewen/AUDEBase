import type { CollectionDef } from './types'

export const rolesCollection: CollectionDef = {
  name: 'roles',
  title: '角色',
  fields: [
    { name: 'name',        type: 'string', label: '角色名称', required: true },
    { name: 'description', type: 'string', label: '描述' },
    { name: 'permissions', type: 'string', label: '权限' },
    { name: 'createdAt',   type: 'date',   label: '创建时间' },
  ],
}
