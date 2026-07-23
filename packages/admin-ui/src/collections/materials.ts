import type { CollectionDef } from './types'

export const materialsCollection: CollectionDef = {
  name: 'materials',
  title: '材料',
  fields: [
    { name: 'name',     type: 'string', label: '材料名称', required: true },
    { name: 'type',     type: 'enum',   label: '类型',  enumValues: ['PLA', 'ABS', 'PETG', '树脂'] },
    { name: 'spec',     type: 'string', label: '规格' },
    { name: 'quantity', type: 'number', label: '库存数量' },
    { name: 'lowStock', type: 'number', label: '低库存预警线' },
    { name: 'unit',     type: 'string', label: '单位' },
  ],
}
