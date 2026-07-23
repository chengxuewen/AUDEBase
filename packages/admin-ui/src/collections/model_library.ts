import type { CollectionDef } from './types'

export const modelLibraryCollection: CollectionDef = {
  name: 'model_library',
  title: '模型库',
  fields: [
    { name: 'name',        type: 'string', label: '模型名称', required: true },
    { name: 'category',    type: 'string', label: '分类' },
    { name: 'description', type: 'string', label: '描述' },
    { name: 'fileSize',    type: 'number', label: '文件大小(KB)' },
    { name: 'uploadedAt',  type: 'date',   label: '上传时间', format: 'YYYY-MM-DD HH:mm' },
  ],
}
