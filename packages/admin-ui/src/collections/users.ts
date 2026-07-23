import type { CollectionDef } from './types'

export const usersCollection: CollectionDef = {
  name: 'users',
  title: '用户',
  fields: [
    { name: 'username',  type: 'string',  label: '用户名', required: true },
    { name: 'email',     type: 'string',  label: '邮箱' },
    { name: 'role',      type: 'string',  label: '角色' },
    { name: 'active',    type: 'boolean', label: '启用' },
    { name: 'createdAt', type: 'date',    label: '创建时间' },
  ],
}
