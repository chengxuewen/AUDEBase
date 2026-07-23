import type { FieldDef } from '@audebase/schema-engine'
import { Input, InputNumber, Select, Switch, DatePicker } from 'antd'
import type { ProColumns } from '@ant-design/pro-table'
import type { ReactNode } from 'react'

// ponytail: Row alias avoids shadowing built-in Record<K,V>
type Row = Record<string, unknown>

// ── ProTable column mapping ──────────────────────────────────────────────

export function toProTableColumn(field: FieldDef): ProColumns<Row> {
  const base: ProColumns<Row> = {
    dataIndex: field.name as string,
    title: field.label || field.name,
    ellipsis: true,
  }

  switch (field.type) {
    case 'string':
      return { ...base, copyable: true }
    case 'number':
      return { ...base, sorter: true, align: 'right' }
    case 'boolean':
      return {
        ...base,
        render: (_dom, r) => (r[field.name] ? '✅' : '❌'),
      }
    case 'enum':
      return {
        ...base,
        valueEnum: Object.fromEntries((field.enumValues ?? []).map((v: string) => [v, { text: v }])),
      }
    case 'date':
      return {
        ...base,
        sorter: true,
        render: (_dom, r) => {
          const v = r[field.name]
          return v ? new Date(v as string).toLocaleString() : '-'
        },
      }
    case 'belongsTo':
      return {
        ...base,
        render: (_dom, r) => {
          const v = r[field.name]
          if (typeof v === 'object' && v !== null) {
            const obj = v as Record<string, unknown>
            return (obj.name ?? obj.id ?? String(v)) as ReactNode
          }
          return (v as ReactNode) ?? '-'
        },
      }
    case 'hasMany':
      return {
        ...base,
        render: (_dom, r) => {
          const v = r[field.name]
          return Array.isArray(v) ? `${v.length} 项` : '-'
        },
      }
    default:
      return base
  }
}

// ── Form field mapping ───────────────────────────────────────────────────

export function toFormField(field: FieldDef): ReactNode {
  switch (field.type) {
    case 'string':
      return <Input key={field.name} placeholder={field.label} />
    case 'number':
      return <InputNumber key={field.name} style={{ width: '100%' }} />
    case 'boolean':
      return <Switch key={field.name} />
    case 'enum':
      return <Select key={field.name} options={(field.enumValues ?? []).map((v: string) => ({ label: v, value: v }))} />
    case 'date':
      return <DatePicker key={field.name} showTime format="YYYY-MM-DD HH:mm" />
    case 'belongsTo':
      // ponytail: bare Select until relation data loading is wired
      return <Select key={field.name} showSearch />
    case 'hasMany':
      return <Select key={field.name} mode="multiple" />
    default:
      return <Input key={field.name} />
  }
}

// ── Form validation rules ────────────────────────────────────────────────

export function toFormRules(field: FieldDef): Array<{ required: boolean; message: string }> {
  if (field.required) {
    return [{ required: true, message: `请输入${field.label || field.name}` }]
  }
  return []
}
